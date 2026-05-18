import User from '../models/user.js';
import Task from '../models/task.js';
import KYCVerification from '../models/kycVerification.js';
import AdminNotification from '../models/adminNotification.js';
import Notification from '../models/notification.js'; // Added missing import!
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
            unverifiedUsers, disputes,
            kycDiditCount, kycManualCount // 🚨 NEW: Count User KYC Methods
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
            Report.countDocuments({ status: 'pending' }),
            // Count verified USERS via didit
            KYCVerification.countDocuments({ userType: 'User', status: 'approved', provider: 'didit' }),
            // Count verified USERS via manual
            KYCVerification.countDocuments({ userType: 'User', status: 'approved', provider: { $ne: 'didit' } })
        ]);

        res.json({
            status: 'success',
            data: {
                totalUsers, active: activeUsers, inactive: inactiveUsers,
                verified: verifiedUsers, suspended: suspendedUsers,
                pendingKyc, totalTasksPosted: totalTasks, completedTasks,
                unverified: unverifiedUsers, disputes,
                // 🚨 NEW: Return to frontend
                verifiedViaDidit: kycDiditCount, 
                verifiedManually: kycManualCount
            }
        });
    } catch (error) {
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

        const kycRecord = await KYCVerification.findOne({ user: userId })
            .select('status type idType nin idNumber maskedNin verificationData provider');

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

        // 🚨 NEW: Calculate Security metrics for the frontend card
        const isLocked = user.lockUntil && new Date(user.lockUntil) > new Date();
        let securityStatus = 'Secure';
        if (!user.isActive) securityStatus = 'Suspended';
        else if (isLocked) securityStatus = 'Locked';

        // Simple risk score logic: 20 points per failed login, max 100.
        const riskScore = isLocked ? 100 : Math.min((user.loginAttempts || 0) * 20, 100);

        res.json({
            status: 'success',
            data: {
                user, 
                wallet: { balance: user.wallet || 0, escrow: escrowBalance },
                kyc: { 
                    status: kycRecord?.status || 'Not Submitted', 
                    type: kycRecord?.verificationData?.documentType || kycRecord?.type || kycRecord?.idType || 'N/A',
                    number: kycRecord?.nin || kycRecord?.idNumber || 'Not Submitted',
                    method: kycRecord?.provider === 'didit' ? 'Didit (Automated)' : 'Manual'
                },
                stats: {
                    rating: 0,
                    completionRate: "0%",
                    completedTasks: 0,
                    totalTransaction: 0,
                    currentBalance: user.wallet || 0
                },
                // 🚨 NEW: Pass the security object expected by the UI
                security: {
                    riskScore: riskScore,
                    loginAttempts: user.loginAttempts || 0,
                    lastKnownIp: user.lastKnownIp || 'Unknown',
                    status: securityStatus
                },
                tasks, 
                transactions, 
                activityLog 
            }
        });
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch user details' });
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

// Inside your adminUserController.js

export const sendUserEmail = async (req, res) => {
    try {
        const { subject, message } = req.body;
        const user = await User.findById(req.params.id);
        
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
        
        // 1. Send Professional Branded Email 
        const html = customAdminEmailHtml({ name: user.fullName, message });
        await sendEmail({ to: user.emailAddress, subject, html });

        // 2. NEW: Send In-App Notification (Fixed Enum)
        await Notification.create({
            user: user._id,
            title: subject,
            message: message,
            type: 'Announcement' // <-- Fixed to match schema enums
        });

        await logAdminAction({ adminId: req.admin._id, action: 'SENT_EMAIL_TO_USER', resourceType: 'User', resourceId: user._id, req });

        res.json({ status: 'success', message: 'Email and In-App Notification sent successfully' });
    } catch (error) {
        console.error('Send User Email Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send communication' });
    }
};

export const sendBulkUserEmail = async (req, res) => {
    try {
        const { subject, message, targetGroup } = req.body; 
        
        let query = {};
        if (targetGroup === 'verified') query.isKYCVerified = true;
        else if (targetGroup === 'unverified') query.isKYCVerified = false;

        const users = await User.find(query).select('_id emailAddress fullName');

        if (users.length === 0) {
            return res.status(404).json({ status: 'error', message: `No ${targetGroup || 'matching'} users found.` });
        }

        // FIX 1: Strict Mongoose Enum Matching
        // Map the targetGroup to a valid 'audience' enum string from your schema
        let mappedAudience = 'Selected Users'; 
        if (!targetGroup || targetGroup === 'all') mappedAudience = 'All Users';

        // ADDED: Create an AdminNotification record so this bulk email shows up on the CTO's dashboard!
        const newBroadcast = await AdminNotification.create({
            title: subject,
            message: message,
            type: 'Announcement', // FIX 2: Mapped to the correct schema enum (removed 'System ')
            audience: mappedAudience, // FIX 3: Mapped to the correct schema enum
            sentThrough: ['Email', 'In-App'], // FIX 4: Added so the UI pills light up on the dashboard!
            recipientsCount: users.length,
            sentBy: req.admin._id
        });

        res.json({ status: 'success', message: `Initiated! Sending emails to ${users.length} users in the background.` });

        (async () => {
            for (const user of users) {
                try {
                    const html = customAdminEmailHtml({ name: user.fullName || 'User', message });
                    await sendEmail({ 
                        to: user.emailAddress, 
                        subject, 
                        html,
                        // Pass the ID so Resend can track opens
                        dbNotificationId: newBroadcast._id 
                    });

                    await Notification.create({
                        user: user._id,
                        title: subject,
                        message: message,
                        type: 'Announcement' // Fixed here as well to match enums
                    });
                } catch (err) {
                    console.error(`Failed to send email to User ${user.emailAddress}`, err);
                }
            }
            
            await logAdminAction({ 
                adminId: req.admin._id, 
                action: `BULK_EMAIL_${targetGroup?.toUpperCase() || 'ALL'}_USERS`, 
                resourceType: 'AdminNotification', 
                resourceId: newBroadcast._id, 
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

// GET /api/admin/users-list
export const getLightweightUsersList = async (req, res) => {
    try {
        // 1. .select() ensures we ONLY pull these exact fields from the DB. 
        // .lean() strips away Mongoose formatting, making the query lightning fast.
        const users = await User.find().select('_id fullName emailAddress').lean();
        const taskers = await Tasker.find().select('_id firstName lastName emailAddress').lean();

        // 2. Format Users to match the frontend's requested shape
        const formattedUsers = users.map(user => {
            // Splitting fullName into firstName and lastName for the frontend
            const nameParts = user.fullName ? user.fullName.split(' ') : [''];
            return {
                _id: user._id,
                userType: 'user', // The frontend guy requested this
                firstName: nameParts[0] || '',
                lastName: nameParts.slice(1).join(' ') || '',
                emailAddress: user.emailAddress
            };
        });

        // 3. Format Taskers
        const formattedTaskers = taskers.map(tasker => ({
            _id: tasker._id,
            userType: 'tasker',
            firstName: tasker.firstName || '',
            lastName: tasker.lastName || '',
            emailAddress: tasker.emailAddress
        }));

        // 4. Combine into one clean array
        const allAccounts = [...formattedUsers, ...formattedTaskers];

        res.status(200).json({
            status: 'success',
            results: allAccounts.length,
            data: allAccounts // This matches their screenshot perfectly
        });

    } catch (error) {
        console.error('Failed to fetch lightweight users list:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to fetch users' 
        });
    }
};