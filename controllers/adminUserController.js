import User from '../models/user.js';
import Task from '../models/task.js';
import KYCVerification from '../models/kycVerification.js';
import Report from '../models/report.js';
import { logAdminAction } from '../utils/auditLogger.js';
import { escapeRegex } from '../utils/searchUtils.js';
import { sendEmail, customAdminEmailHtml } from '../services/emailService.js'; // Ensure path is correct

// GET /api/admin/users/stats
export const getUserStats = async (req, res) => {
    try {
        const [
            totalUsers, activeUsers, inactiveUsers, verifiedUsers,
            suspendedUsers, pendingKyc, totalTasks, completedTasks,
            unverifiedUsers, disputes
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isActive: true }),
            User.countDocuments({ isActive: false }), 
            User.countDocuments({ isKYCVerified: true }),
            User.countDocuments({ isActive: false, isDeleted: false }), 
            KYCVerification.countDocuments({ status: 'pending' }),
            Task.countDocuments(),
            Task.countDocuments({ status: 'completed' }),
            User.countDocuments({ isKYCVerified: false }),
            Report.countDocuments({ status: 'pending' })
        ]);

        res.json({
            status: 'success',
            data: {
                totalUsers, active: activeUsers, inactive: inactiveUsers,
                verified: verifiedUsers, suspended: suspendedUsers,
                pendingKyc, totalTasksPosted: totalTasks, completedTasks,
                unverified: unverifiedUsers, disputes
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch user stats' });
    }
};

// GET /api/admin/users
export const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status, kycVerified, emailVerified } = req.query;
        
        const query = { isDeleted: { $ne: true } };

        // 1. Search
        if (search) {
            const escaped = escapeRegex(search);
            query.$or = [
                { fullName: { $regex: escaped, $options: 'i' } },
                { emailAddress: { $regex: escaped, $options: 'i' } },
                { phoneNumber: { $regex: escaped, $options: 'i' } } 
            ];
        }

        // 2. Status Filters
        if (status === 'active') query.isActive = true;
        if (status === 'suspended') query.isActive = false;

        // 3. Verification Filters (NEW)
        if (kycVerified === 'true') query.isKYCVerified = true;
        if (kycVerified === 'false') query.isKYCVerified = false;
        
        if (emailVerified === 'true') query.isEmailVerified = true;
        if (emailVerified === 'false') query.isEmailVerified = false;

        const users = await User.find(query)
            .select('-password') 
            .sort({ lastLoginAt: -1 }) 
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(query);

        res.json({
            status: 'success',
            results: users.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            users
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch users' });
    }
};

// GET /api/admin/users/:id
export const getUserById = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId).select('-password');

        if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

        const kyc = await KYCVerification.findOne({ user: userId }).select('status type');
        const tasks = await Task.find({ user: userId }).select('title budget status createdAt').sort({ createdAt: -1 }).limit(10);

        const escrowAgg = await Task.aggregate([
            { $match: { user: user._id, isEscrowHeld: true } },
            { $group: { _id: null, totalHeld: { $sum: '$escrowAmount' } } }
        ]);
        const escrowBalance = escrowAgg[0]?.totalHeld || 0;

        const transactions = await Task.find({ user: userId, status: 'completed' })
            .select('title escrowAmount escrowStatus updatedAt')
            .sort({ updatedAt: -1 }).limit(10);

        const activityLog = [
            { action: 'Last Login', date: user.lastLoginAt || user.updatedAt, details: 'User accessed the platform' },
            { action: 'Account Created', date: user.createdAt, details: 'User registered' },
            ...tasks.map(t => ({ action: 'Posted Task', date: t.createdAt, details: `Posted "${t.title}"` }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

        res.json({
            status: 'success',
            data: {
                user, 
                wallet: { balance: user.wallet || 0, escrow: escrowBalance },
                verification: { status: kyc?.status || 'Not Submitted', type: kyc?.type || 'N/A' },
                tasks, transactions, activityLog 
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Get user details error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch user details'
        });
    }
};

// PATCH ACTIONS
export const activateUser = async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'ACTIVATE_USER_ACCOUNT', resourceType: 'User', resourceId: user._id, req });
    res.json({ status: 'success', message: 'User activated' });
};

export const deactivateUser = async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'DEACTIVATE_USER_ACCOUNT', resourceType: 'User', resourceId: user._id, req });
    res.json({ status: 'success', message: 'User deactivated' });
};

export const lockUser = async (req, res) => {
    const lockDuration = 24 * 60 * 60 * 1000; 
    const user = await User.findByIdAndUpdate(req.params.id, { lockUntil: Date.now() + lockDuration }, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'LOCK_USER_ACCOUNT', resourceType: 'User', resourceId: user._id, req });
    res.json({ status: 'success', message: 'User account locked for 24 hours' });
};

export const unlockUser = async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { lockUntil: null }, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'UNLOCK_USER_ACCOUNT', resourceType: 'User', resourceId: user._id, req });
    res.json({ status: 'success', message: 'User account unlocked' });
};

export const softDeleteUser = async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false, isDeleted: true }, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'SOFT_DELETE_USER', resourceType: 'User', resourceId: user._id, req });
    res.json({ status: 'success', message: 'User soft deleted successfully' });
};

export const restoreUser = async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true, isDeleted: false, lockUntil: null }, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    await logAdminAction({ adminId: req.admin._id, action: 'RESTORE_USER_ACCOUNT', resourceType: 'User', resourceId: user._id, req });
    res.json({ status: 'success', message: 'User account restored' });
};

export const getUserProfile = async (req, res) => {
    const user = req.user;
    const latestKyc = await KYCVerification.findOne({ user: user._id }).sort({ createdAt: -1 });
    res.json({
        status: 'success',
        data: {
            user,
            kyc: {
                status: latestKyc?.status || 'not_submitted',
                submittedAt: latestKyc?.createdAt || null,
                verifiedAt: latestKyc?.verifiedAt || null
            }
        }
    });
};

// NEW: POST /api/admin/users/:id/send-email
export const sendUserEmail = async (req, res) => {
    try {
        const { subject, message } = req.body;
        const user = await User.findById(req.params.id);
        
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
        
        // 1. Send Professional Branded Email
        const html = customAdminEmailHtml({ name: user.fullName, message });
        await sendEmail({ to: user.emailAddress, subject, html });

        // 2. NEW: Send In-App Notification
        await Notification.create({
            user: user._id,
            title: subject,
            message: message,
            type: 'Direct Message' // Or whatever type categorizes admin messages
        });

        await logAdminAction({ adminId: req.admin._id, action: 'SENT_EMAIL_TO_USER', resourceType: 'User', resourceId: user._id, req });

        res.json({ status: 'success', message: 'Email and In-App Notification sent successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to send communication' });
    }
};

// POST /api/admin/users/bulk-email
export const sendBulkUserEmail = async (req, res) => {
    try {
        const { subject, message, targetGroup } = req.body; 
        
        let query = {};
        // Adjust 'verifyIdentity' if your User model uses a different field name for KYC
        if (targetGroup === 'verified') query.verifyIdentity = true;
        else if (targetGroup === 'unverified') query.verifyIdentity = false;

        const users = await User.find(query).select('_id emailAddress fullName');

        if (users.length === 0) {
            return res.status(404).json({ status: 'error', message: `No ${targetGroup} users found.` });
        }

        // Instantly reply to the frontend
        res.json({ status: 'success', message: `Initiated! Sending emails to ${users.length} users in the background.` });

        // Background loop
        (async () => {
            for (const user of users) {
                try {
                    const html = customAdminEmailHtml({ name: user.fullName, message });
                    await sendEmail({ to: user.emailAddress, subject, html });

                    await Notification.create({
                        user: user._id,
                        title: subject,
                        message: message,
                        type: 'System Announcement'
                    });
                } catch (err) {
                    console.error(`Failed to send email to User ${user.emailAddress}`, err);
                }
            }
            
            await logAdminAction({ 
                adminId: req.admin._id, 
                action: `BULK_EMAIL_${targetGroup?.toUpperCase() || 'ALL'}_USERS`, 
                resourceType: 'User', 
                resourceId: null, 
                req 
            });
        })();

    } catch (error) {
        console.error('Bulk User email error:', error);
        if (!res.headersSent) {
            res.status(500).json({ status: 'error', message: 'Failed to initiate bulk email' });
        }
    }
};