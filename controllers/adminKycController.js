import KYCVerification from '../models/kycVerification.js';
import User from '../models/user.js';
import { sendKycNotification } from '../services/onesignal.js';
import { logAdminAction } from '../utils/auditLogger.js';
import { saveNotification } from '../services/notificationService.js';

// GET /api/admin/kyc?status=pending
export const getAllKycRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};

        const kycRecords = await KYCVerification.find(filter)
            .populate('user', 'fullName emailAddress')
            .sort({ createdAt: -1 });

        res.json({
            status: 'success',
            count: kycRecords.length,
            records: kycRecords
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch KYC records'
        });
    }
};

// PATCH /api/admin/kyc/:id/approve
export const approveKyc = async (req, res) => {
    try {
        const kyc = await KYCVerification.findById(req.params.id);

        if (!kyc) {
            return res.status(404).json({
                status: 'error',
                message: 'KYC record not found'
            });
        }

        if (kyc.status === 'approved') {
            return res.status(400).json({
                status: 'error',
                message: 'KYC already approved'
            });
        }

        kyc.status = 'approved';
        kyc.verifiedAt = new Date();
        await kyc.save();

        const user = await User.findById(kyc.user);
        if (user) {
            user.isKYCVerified = true;
            await user.save();

            // 🔔 Push notification
            if (user.notificationId) {
                await sendKycNotification(
                    user.notificationId,
                    'approved'
                );
            }

            // 🧾 In-app notification
            await saveNotification({
                userId: user._id,
                title: 'KYC Approved',
                message: 'Your identity verification has been approved.',
                type: 'kyc'
            });
        }

        await logAdminAction({
            adminId: req.admin._id,
            action: 'APPROVE_KYC',
            resourceType: 'KYC',
            resourceId: kyc._id,
            req
        });

        res.json({
            status: 'success',
            message: 'KYC approved successfully'
        });

    } catch (error) {
        console.error('Approve KYC error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to approve KYC'
        });
    }
};

// PATCH /api/admin/kyc/:id/reject
export const rejectKyc = async (req, res) => {
    try {
        const { reason } = req.body;

        const kyc = await KYCVerification.findById(req.params.id);
        if (!kyc) {
            return res.status(404).json({
                status: 'error',
                message: 'KYC record not found'
            });
        }

        kyc.status = 'rejected';
        kyc.rejectionReason = reason || 'Verification failed';
        await kyc.save();

        const user = await User.findById(kyc.user);
        if (user) {
            if (user.notificationId) {
                await sendKycNotification(
                    user.notificationId,
                    'rejected',
                    kyc.rejectionReason
                );
            }

            await saveNotification({
                userId: user._id,
                title: 'KYC Rejected',
                message: kyc.rejectionReason,
                type: 'kyc'
            });
        }

        await logAdminAction({
            adminId: req.admin._id,
            action: 'REJECT_KYC',
            resourceType: 'KYC',
            resourceId: kyc._id,
            req
        });

        res.json({
            status: 'success',
            message: 'KYC rejected successfully'
        });

    } catch (error) {
        console.error('Reject KYC error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to reject KYC'
        });
    }
};

// GET /api/admin/kyc/stats
export const getKycStats = async (req, res) => {
    try {
        const [total, pending, approved, rejected] = await Promise.all([
            KYCVerification.countDocuments(),
            KYCVerification.countDocuments({ status: 'pending' }),
            KYCVerification.countDocuments({ status: 'approved' }),
            KYCVerification.countDocuments({ status: 'rejected' }),
        ]);

        res.json({
            status: 'success',
            data: { total, pending, approved, rejected }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch KYC statistics'
        });
    }
};
