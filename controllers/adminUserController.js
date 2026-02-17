import User from '../models/user.js';
import Task from '../models/task.js';
import KYCVerification from '../models/kycVerification.js';
import Report from '../models/report.js';
import { logAdminAction } from '../utils/auditLogger.js';

// GET /api/admin/users/stats (Top Cards)
export const getUserStats = async (req, res) => {
    try {
        const [
            totalUsers,
            activeUsers,
            inactiveUsers,
            verifiedUsers,
            suspendedUsers,
            pendingKyc,
            totalTasks,
            completedTasks,
            unverifiedUsers,
            disputes
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isActive: true }),
            User.countDocuments({ isActive: false }), // Inactive
            User.countDocuments({ isKYCVerified: true }),
            User.countDocuments({ isActive: false }), // Suspended (Assuming suspended = inactive)
            KYCVerification.countDocuments({ status: 'pending' }),
            Task.countDocuments(),
            Task.countDocuments({ status: 'completed' }),
            User.countDocuments({ isKYCVerified: false }),
            Report.countDocuments({ status: 'pending' })
        ]);

        res.json({
            status: 'success',
            data: {
                totalUsers,
                active: activeUsers,
                inactive: inactiveUsers,
                verified: verifiedUsers,
                suspended: suspendedUsers,
                pendingKyc,
                totalTasksPosted: totalTasks,
                completedTasks,
                unverified: unverifiedUsers,
                disputes
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch user stats' });
    }
};

// GET /api/admin/users (List View - Matches Figma Filters)
export const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status, verified } = req.query;
        
        const query = { isDeleted: { $ne: true } };

        // 1. Search (Name, Email, Phone)
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } } // Added Phone search
            ];
        }

        // 2. Status Tab Logic (Active vs Suspended)
        if (status === 'active') query.isActive = true;
        if (status === 'suspended') query.isActive = false;

        // 3. Verified Tab Logic
        if (verified === 'true') query.isKYCVerified = true;
        if (verified === 'false') query.isKYCVerified = false;

        const users = await User.find(query)
            .select('-password') // We don't need the password
            .sort({ lastLoginAt: -1 }) // Sort by Last Active (matches UI "Last Active" column)
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
        res.status(500).json({ status: 'error', message: 'Failed to fetch users' });
    }
};


// GET /api/admin/users/:id
export const getUserById = async (req, res) => {
    try {
        const userId = req.params.id;

        // 1. Fetch User Profile
        const user = await User.findById(userId).select('-password');

        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        // 2. Fetch User's KYC Status (for the "Verification" badge)
        const kyc = await KYCVerification.findOne({ user: userId }).select('status type');

        // 3. Fetch User's Posted Tasks (Section 2 of UI)
        // Shows the last 10 tasks they posted
        const tasks = await Task.find({ user: userId })
            .select('title budget status createdAt')
            .sort({ createdAt: -1 })
            .limit(10);

        // 4. Calculate "Wallet" & "Escrow" figures (Section 1 of UI)
        // Assuming walletBalance is on the user model. 
        // We calculate "Escrow" by summing budget of active tasks.
        const escrowAgg = await Task.aggregate([
            { 
                $match: { 
                    user: user._id, 
                    isEscrowHeld: true 
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    totalHeld: { $sum: '$escrowAmount' } 
                } 
            }
        ]);
        const escrowBalance = escrowAgg[0]?.totalHeld || 0;

        // 5. Fetch "Transaction History" (Section 3 of UI)
        // In your system, transactions are completed tasks.
        const transactions = await Task.find({ 
                user: userId, 
                status: 'completed' // Or where escrowStatus is 'released'/'refunded'
            })
            .select('title escrowAmount escrowStatus updatedAt')
            .sort({ updatedAt: -1 })
            .limit(10);

        // 6. Construct a simple "Activity Log" (Section 4 of UI)
        // Since we don't have a dedicated "User Activity Log" collection yet, 
        // we create one dynamically from their tasks and login info.
        const activityLog = [
            {
                action: 'Last Login',
                date: user.lastLoginAt || user.updatedAt,
                details: 'User accessed the platform'
            },
            {
                action: 'Account Created',
                date: user.createdAt,
                details: 'User registered'
            },
            ...tasks.map(t => ({
                action: 'Posted Task',
                date: t.createdAt,
                details: `Posted "${t.title}"`
            }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);


        res.json({
            status: 'success',
            data: {
                user, // The main profile info
                wallet: {
                    balance: user.walletBalance || 0, // Ensure field exists in User model
                    escrow: escrowBalance
                },
                verification: {
                    status: kyc?.status || 'Not Submitted',
                    type: kyc?.type || 'N/A'
                },
                tasks,        // Populates "Posted Tasks" table
                transactions, // Populates "Transaction History" table
                activityLog   // Populates "Activity Log" timeline
            }
        });

    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch user details'
        });
    }
};

// PATCH /api/admin/users/:id/activate
export const activateUser = async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive: true },
        { new: true }
    );

    if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    await logAdminAction({
            adminId: req.admin._id,
            action: 'ACTIVATE_USER_ACCOUNT',
            resourceType: 'User',
            resourceId: user._id,
            req
        });
       

    res.json({
        status: 'success',
        message: 'User activated'
    });
};

// PATCH /api/admin/users/:id/deactivate
export const deactivateUser = async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
    );

    if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    await logAdminAction({
            adminId: req.admin._id,
            action: 'DEACTIVATE_USER_ACCOUNT',
            resourceType: 'User',
            resourceId: user._id,
            req
        });
       
    res.json({
        status: 'success',
        message: 'User deactivated'
    });
};

// PATCH /api/admin/users/:id/lock
export const lockUser = async (req, res) => {
    const lockDuration = 24 * 60 * 60 * 1000; // 24 hours

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { lockUntil: Date.now() + lockDuration },
        { new: true }
    );

    if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    await logAdminAction({
            adminId: req.admin._id,
            action: 'LOCK_USER_ACCOUNT',
            resourceType: 'User',
            resourceId: user._id,
            req
        });

    res.json({
        status: 'success',
        message: 'User account locked for 24 hours'
    });
};

// PATCH /api/admin/users/:id/unlock
export const unlockUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { lockUntil: null },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        await logAdminAction({
            adminId: req.admin._id,
            action: 'UNLOCK_USER_ACCOUNT',
            resourceType: 'User',
            resourceId: user._id,
            req
        });

        res.json({
            status: 'success',
            message: 'User account unlocked'
        });

    } catch (error) {
        console.error('Unlock user error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to unlock user'
        });
    }
};
// DELETE /api/admin/users/:id (soft delete)
export const softDeleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            {
                isActive: false,
                isDeleted: true
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        await logAdminAction({
            adminId: req.admin._id,
            action: 'SOFT_DELETE_USER',
            resourceType: 'User',
            resourceId: user._id,
            req
        });

        res.json({
            status: 'success',
            message: 'User soft deleted successfully'
        });

    } catch (error) {
        console.error('Soft delete user error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete user'
        });
    }
};
// PATCH /api/admin/users/:id/restore
export const restoreUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
               {
                isActive: true,
                isDeleted: false,
                lockUntil: null
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        await logAdminAction({
            adminId: req.admin._id,
            action: 'RESTORE_USER_ACCOUNT',
            resourceType: 'User',
            resourceId: user._id,
            req
        });

        res.json({
            status: 'success',
            message: 'User account restored'
        });

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to restore user'
        });
    }
};


export const getUserProfile = async (req, res) => {
    const user = req.user;

    const latestKyc = await KYCVerification.findOne({ user: user._id })
        .sort({ createdAt: -1 });

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
