import Tasker from '../models/tasker.js';
import Task from '../models/task.js';
import Category from '../models/category.js';
import Report from '../models/report.js';
import KYCVerification from '../models/kycVerification.js';
import Notification from '../models/notification.js'; // Added missing import!
import { logAdminAction } from '../utils/auditLogger.js';
import { escapeRegex } from '../utils/searchUtils.js';
import * as Sentry from '@sentry/node';
import { sendEmail, customAdminEmailHtml } from '../services/emailService.js';

// GET /api/admin/taskers/stats
export const getTaskerStats = async (req, res) => {
    try {
        const [
            totalTaskers, activeTaskers, verifiedTaskers, pendingKyc,
            suspendedTaskers, completedTasks, totalCategories, disputes, ratingAgg
        ] = await Promise.all([
            Tasker.countDocuments(),
            Tasker.countDocuments({ isActive: true }),
            Tasker.countDocuments({ verifyIdentity: true }), 
            Tasker.countDocuments({ verifyIdentity: false }), 
            Tasker.countDocuments({ isActive: false }), 
            Task.countDocuments({ status: 'completed' }),
            Category.countDocuments(),
            Report.countDocuments({ status: 'pending' }),
            Tasker.aggregate([
                { $match: { averageRating: { $exists: true } } }, 
                { $group: { _id: null, avg: { $avg: '$averageRating' } } }
            ])
        ]);

        const avgRating = ratingAgg[0]?.avg?.toFixed(1) || 0;

        res.json({
            status: 'success',
            data: {
                total: totalTaskers, active: activeTaskers, verified: verifiedTaskers,
                suspended: suspendedTaskers, pendingKyc, completedTasks,
                categories: totalCategories, averageRating: avgRating, disputes
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Tasker stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch tasker stats' });
    }
};

// GET /api/admin/taskers
export const getAllTaskers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, kycVerified, emailVerified, status, sort } = req.query;

        const query = {};

        // Search
        if (search) {
            const escaped = escapeRegex(search);
            query.$or = [
                { firstName: { $regex: escaped, $options: 'i' } },
                { lastName: { $regex: escaped, $options: 'i' } },
                { emailAddress: { $regex: escaped, $options: 'i' } } 
            ];
        }

        // Filters
        if (status === 'active') query.isActive = true;
        if (status === 'suspended') query.isActive = false;
        
        // Verification Filters
        if (kycVerified === 'true') query.verifyIdentity = true;
        if (kycVerified === 'false') query.verifyIdentity = false;

        if (emailVerified === 'true') query.isEmailVerified = true;
        if (emailVerified === 'false') query.isEmailVerified = false;

        // Sorting
        let sortOption = { createdAt: -1 }; 
        if (sort === 'rating') sortOption = { averageRating: -1 }; 

        // OPTIMIZATION: Fire the find() and countDocuments() at the same time
        const [taskers, total] = await Promise.all([
            Tasker.find(query)
                .select('-password') 
                .populate('subCategories', 'name') 
                .sort(sortOption)
                .limit(limit * 1)
                .skip((page - 1) * limit),
            Tasker.countDocuments(query)
        ]);

        // Inside getAllTaskers...
        const formattedTaskers = taskers.map(t => {
            // Check if the lock date exists and is still in the future
            const isCurrentlyLocked = !!(t.lockUntil && new Date(t.lockUntil) > new Date());

            return {
                _id: t._id,
                firstName: t.firstName,
                lastName: t.lastName,
                emailAddress: t.emailAddress,
                profilePicture: t.profilePicture || '', 
                categories: t.subCategories,
                isActive: t.isActive,
                verifyIdentity: t.verifyIdentity,
                isEmailVerified: t.isEmailVerified,
                updatedAt: t.updatedAt,
                averageRating: t.averageRating || 0,
                // ADD THESE TWO LINES:
                isLocked: isCurrentlyLocked,
                lockUntil: t.lockUntil || null
            };
        });

        res.json({
            status: 'success',
            results: formattedTaskers.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            taskers: formattedTaskers 
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch taskers' });
    }
};

// GET /api/admin/taskers/:id
export const getTaskerById = async (req, res) => {
    try {
        const taskerId = req.params.id;
        const tasker = await Tasker.findById(taskerId).select('-password').populate('subCategories', 'name');

        if (!tasker) return res.status(404).json({ status: 'error', message: 'Tasker not found' });

        // OPTIMIZATION: 5 Waterfall Queries combined into 1 Parallel Query execution
        const [kycRecord, totalAssigned, completedCount, revenueAgg, recentReviews] = await Promise.all([
            KYCVerification.findOne({ user: taskerId }).select('idType idNumber status'),
            Task.countDocuments({ assignedTasker: tasker._id }),
            Task.countDocuments({ assignedTasker: tasker._id, status: 'completed' }),
            Task.aggregate([
                { $match: { assignedTasker: tasker._id, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$budget' } } }
            ]),
            Task.find({ assignedTasker: tasker._id, status: 'completed', rating: { $exists: true } })
                .populate('user', 'fullName profilePicture') 
                .select('rating reviewText createdAt user') 
                .sort({ createdAt: -1 })
                .limit(5)
        ]);

        const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;
        const totalTransaction = revenueAgg[0]?.total || 0;

        const reviewsFormatted = recentReviews.map(r => ({
            id: r._id, reviewerName: r.user?.fullName || 'Anonymous',
            reviewerImage: r.user?.profilePicture || '', rating: r.rating || 0,
            comment: r.reviewText || 'No comment provided', date: r.createdAt
        }));
        const isCurrentlyLocked = !!(tasker.lockUntil && new Date(tasker.lockUntil) > new Date());
        res.json({
            status: 'success',
            data: {
                kyc: {
                    type: kycRecord?.idType || 'N/A', number: kycRecord?.idNumber || 'Not Submitted',
                    status: kycRecord?.status || 'unverified'
                },
                stats: {
                    rating: tasker.averageRating || 0, completionRate: `${completionRate}%`,
                    completedTasks: completedCount, totalTransaction, currentBalance: tasker.wallet || 0 
                },
                account: {
                    userId: tasker._id, role: 'Tasker', fullName: `${tasker.firstName} ${tasker.lastName}`,
                    emailAddress: tasker.emailAddress, profilePicture: tasker.profilePicture || '', 
                    lastUpdated: tasker.updatedAt,
                    isLocked: isCurrentlyLocked,
                    lockUntil: tasker.lockUntil || null
                },
                categories: tasker.subCategories.map(c => c.name),
                reviews: reviewsFormatted
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Get tasker details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch tasker details' });
    }
};

// ACTIONS
export const verifyTasker = async (req, res) => {
    const tasker = await Tasker.findByIdAndUpdate(req.params.id, { verifyIdentity: true }, { new: true }); 
    if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'VERIFY_TASKER', resourceType: 'Tasker', resourceId: tasker._id, req });
    res.json({ status: 'success', message: 'Tasker verified' });
};

export const suspendTasker = async (req, res) => {
    const tasker = await Tasker.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'SUSPEND_TASKER', resourceType: 'Tasker', resourceId: tasker._id, req });
    res.json({ status: 'success', message: 'Tasker suspended' });
};

export const activateTasker = async (req, res) => {
    const tasker = await Tasker.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'ACTIVATE_TASKER', resourceType: 'Tasker', resourceId: tasker._id, req });
    res.json({ status: 'success', message: 'Tasker activated' });
};

// NEW: POST /api/admin/taskers/:id/send-email
export const sendTaskerEmail = async (req, res) => {
    try {
        const { subject, message } = req.body;
        const tasker = await Tasker.findById(req.params.id);
        
        if (!tasker) return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        
        // 1. Send Professional Branded Email
        const html = customAdminEmailHtml({ name: `${tasker.firstName} ${tasker.lastName}`, message });
        await sendEmail({ to: tasker.emailAddress, subject, html });

        // 2. NEW: Send In-App Notification
        await Notification.create({
            tasker: tasker._id,
            title: subject,
            message: message,
            type: 'Direct Message'
        });

        await logAdminAction({ adminId: req.admin._id, action: 'SENT_EMAIL_TO_TASKER', resourceType: 'Tasker', resourceId: tasker._id, req });

        res.json({ status: 'success', message: 'Email and In-App Notification sent successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to send communication' });
    }
};

// PATCH /api/admin/taskers/:id/lock
export const lockTasker = async (req, res) => {
    try {
        const lockDuration = 24 * 60 * 60 * 1000; // 24 hours
        const tasker = await Tasker.findByIdAndUpdate(
            req.params.id, 
            { lockUntil: Date.now() + lockDuration }, 
            { new: true }
        );

        if (!tasker) return res.status(404).json({ status: 'error', message: 'Tasker not found' });

        await logAdminAction({ adminId: req.admin._id, action: 'LOCK_TASKER_ACCOUNT', resourceType: 'Tasker', resourceId: tasker._id, req });
        res.json({ status: 'success', message: 'Tasker account locked for 24 hours' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to lock tasker' });
    }
};

// PATCH /api/admin/taskers/:id/unlock
export const unlockTasker = async (req, res) => {
    try {
        const tasker = await Tasker.findByIdAndUpdate(
            req.params.id, 
            { lockUntil: null }, 
            { new: true }
        );

        if (!tasker) return res.status(404).json({ status: 'error', message: 'Tasker not found' });

        await logAdminAction({ adminId: req.admin._id, action: 'UNLOCK_TASKER_ACCOUNT', resourceType: 'Tasker', resourceId: tasker._id, req });
        res.json({ status: 'success', message: 'Tasker account unlocked' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to unlock tasker' });
    }
};

// POST /api/admin/taskers/bulk-email
export const sendBulkTaskerEmail = async (req, res) => {
    try {
        const { subject, message, targetGroup } = req.body; 
        
        // 1. Build the filter query based on the requested group
        let query = {};
        if (targetGroup === 'verified') query.verifyIdentity = true;
        else if (targetGroup === 'unverified') query.verifyIdentity = false;

        // 2. Fetch only the necessary data to save memory
        const taskers = await Tasker.find(query).select('_id emailAddress firstName lastName');

        if (taskers.length === 0) {
            return res.status(404).json({ status: 'error', message: `No ${targetGroup} taskers found.` });
        }

        // 3. IMMEDIATELY respond to the frontend to prevent server timeouts
        res.json({ status: 'success', message: `Initiated! Sending emails to ${taskers.length} taskers in the background.` });

        // 4. Run the email loop in the background (Fire and Forget)
        (async () => {
            for (const tasker of taskers) {
                try {
                    const html = customAdminEmailHtml({ name: `${tasker.firstName} ${tasker.lastName}`, message });
                    await sendEmail({ to: tasker.emailAddress, subject, html });

                    await Notification.create({
                        tasker: tasker._id,
                        title: subject,
                        message: message,
                        type: 'System Announcement'
                    });
                } catch (err) {
                    console.error(`Failed to send email to Tasker ${tasker.emailAddress}`, err);
                }
            }
            
            // Log the bulk action once the loop finishes
            await logAdminAction({ 
                adminId: req.admin._id, 
                action: `BULK_EMAIL_${targetGroup?.toUpperCase() || 'ALL'}_TASKERS`, 
                resourceType: 'Tasker', 
                resourceId: null, 
                req 
            });
        })();

    } catch (error) {
        console.error('Bulk Tasker email error:', error);
        // Only send error if we haven't already sent the success response
        if (!res.headersSent) {
            res.status(500).json({ status: 'error', message: 'Failed to initiate bulk email' });
        }
    }
};