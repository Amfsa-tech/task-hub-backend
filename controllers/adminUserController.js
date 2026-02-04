import User from '../models/user.js';
import KYCVerification from '../models/kycVerification.js';
import { logAdminAction } from '../utils/auditLogger.js';
// GET /api/admin/users
export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');

        res.json({
            status: 'success',
            results: users.length,
            users
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch users'
        });
    }
};

// GET /api/admin/users/:id
export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        res.json({
            status: 'success',
            user
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch user'
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
