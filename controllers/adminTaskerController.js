import Tasker from '../models/tasker.js';
import Task from '../models/task.js';
import Category from '../models/category.js';
import Report from '../models/report.js';
import KYCVerification from '../models/kycVerification.js';
import { logAdminAction } from '../utils/auditLogger.js';
import { escapeRegex } from '../utils/searchUtils.js';
import * as Sentry from '@sentry/node';

// GET /api/admin/taskers/stats
export const getTaskerStats = async (req, res) => {
    try {
        const [
            totalTaskers,
            activeTaskers,
            verifiedTaskers,
            pendingKyc,
            suspendedTaskers,
            completedTasks,
            totalCategories,
            disputes
        ] = await Promise.all([
            Tasker.countDocuments(),
            Tasker.countDocuments({ isActive: true }),
            Tasker.countDocuments({ verifyIdentity: true }), 
            Tasker.countDocuments({ verifyIdentity: false }), 
            Tasker.countDocuments({ isActive: false }), 
            Task.countDocuments({ status: 'completed' }),
            Category.countDocuments(),
            Report.countDocuments({ status: 'pending' })
        ]);

        const ratingAgg = await Tasker.aggregate([
            { $match: { averageRating: { $exists: true } } }, 
            { $group: { _id: null, avg: { $avg: '$averageRating' } } }
        ]);
        const avgRating = ratingAgg[0]?.avg?.toFixed(1) || 0;

        res.json({
            status: 'success',
            data: {
                total: totalTaskers,
                active: activeTaskers,
                verified: verifiedTaskers,
                suspended: suspendedTaskers,
                pendingKyc,
                completedTasks,
                categories: totalCategories,
                averageRating: avgRating,
                disputes
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Tasker stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch tasker stats' });
    }
};

// GET /api/admin/taskers (List View)
export const getAllTaskers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, verified, status, sort } = req.query;

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
        if (verified) query.verifyIdentity = verified === 'true'; 
        if (status === 'active') query.isActive = true;
        if (status === 'suspended') query.isActive = false;

        // Sorting
        let sortOption = { createdAt: -1 }; 
        if (sort === 'rating') sortOption = { averageRating: -1 }; 

        const taskers = await Tasker.find(query)
            .select('-password') 
            .populate('subCategories', 'name') 
            .sort(sortOption)
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // --- THE FIX: Explicitly map the response to guarantee the profilePicture field exists ---
        const formattedTaskers = taskers.map(t => ({
            _id: t._id,
            firstName: t.firstName,
            lastName: t.lastName,
            emailAddress: t.emailAddress,
            profilePicture: t.profilePicture || '', // <--- Always returns at least an empty string
            categories: t.subCategories,
            isActive: t.isActive,
            verifyIdentity: t.verifyIdentity,
            updatedAt: t.updatedAt,
            averageRating: t.averageRating || 0
        }));

        const total = await Tasker.countDocuments(query);

        res.json({
            status: 'success',
            results: formattedTaskers.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            taskers: formattedTaskers // Return the mapped data
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

        const tasker = await Tasker.findById(taskerId)
            .select('-password')
            .populate('subCategories', 'name');

        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        const kycRecord = await KYCVerification.findOne({ user: taskerId })
            .select('idType idNumber status');

        const totalAssigned = await Task.countDocuments({ assignedTasker: tasker._id });
        const completedCount = await Task.countDocuments({ assignedTasker: tasker._id, status: 'completed' });
        
        const completionRate = totalAssigned > 0 
            ? Math.round((completedCount / totalAssigned) * 100) 
            : 0;

        const revenueAgg = await Task.aggregate([
            { $match: { assignedTasker: tasker._id, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$budget' } } }
        ]);
        const totalTransaction = revenueAgg[0]?.total || 0;

        const recentReviews = await Task.find({ 
                assignedTasker: tasker._id, 
                status: 'completed',
                rating: { $exists: true } 
            })
            .populate('user', 'fullName profilePicture') 
            .select('rating reviewText createdAt user') 
            .sort({ createdAt: -1 })
            .limit(5);

        const reviewsFormatted = recentReviews.map(r => ({
            id: r._id,
            reviewerName: r.user?.fullName || 'Anonymous',
            reviewerImage: r.user?.profilePicture || '',
            rating: r.rating || 0,
            comment: r.reviewText || 'No comment provided',
            date: r.createdAt
        }));

        res.json({
            status: 'success',
            data: {
                kyc: {
                    type: kycRecord?.idType || 'N/A',
                    number: kycRecord?.idNumber || 'Not Submitted',
                    status: kycRecord?.status || 'unverified'
                },
                stats: {
                    rating: tasker.averageRating || 0,
                    completionRate: `${completionRate}%`,
                    completedTasks: completedCount,
                    totalTransaction, 
                    currentBalance: tasker.wallet || 0 
                },
                account: {
                    userId: tasker._id,
                    role: 'Tasker',
                    fullName: `${tasker.firstName} ${tasker.lastName}`,
                    emailAddress: tasker.emailAddress, // Added to match list view
                    profilePicture: tasker.profilePicture || '', // <--- THE FIX for Details Page
                    lastUpdated: tasker.updatedAt
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
    try {
        const tasker = await Tasker.findByIdAndUpdate(req.params.id, { verifyIdentity: true }, { new: true }); 
        if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
        
        await logAdminAction({ 
            adminId: req.admin._id, 
            action: 'VERIFY_TASKER', 
            resourceType: 'Tasker', 
            resourceId: tasker._id, 
            req 
        });
        
        res.json({ status: 'success', message: 'Tasker verified' });
    } catch (error) { 
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to verify' }); 
    }
};

export const suspendTasker = async (req, res) => {
    try {
        const tasker = await Tasker.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
        
        await logAdminAction({ 
            adminId: req.admin._id, 
            action: 'SUSPEND_TASKER', 
            resourceType: 'Tasker', 
            resourceId: tasker._id, 
            req 
        });
        
        res.json({ status: 'success', message: 'Tasker suspended' });
    } catch (error) { Sentry.captureException(error); res.status(500).json({ status: 'error', message: 'Failed to suspend' }); }
};

export const activateTasker = async (req, res) => {
    try {
        const tasker = await Tasker.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
        if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
        
        await logAdminAction({ 
            adminId: req.admin._id, 
            action: 'ACTIVATE_TASKER', 
            resourceType: 'Tasker', 
            resourceId: tasker._id, 
            req 
        });
        
        res.json({ status: 'success', message: 'Tasker activated' });
    } catch (error) { Sentry.captureException(error); res.status(500).json({ status: 'error', message: 'Failed to activate' }); }
};