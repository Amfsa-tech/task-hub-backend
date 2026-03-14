import Withdrawal from '../models/withdrawal.js';
import Tasker from '../models/tasker.js';
import Transaction from '../models/transaction.js';
import { logAdminAction } from '../utils/auditLogger.js';

/**
 * GET /api/admin/withdrawals/stats
 * Withdrawal summary stats for admin dashboard.
 */
export const getWithdrawalStats = async (req, res) => {
    try {
        const [
            totalRequests,
            pendingCount,
            approvedCount,
            completedCount,
            rejectedCount,
        ] = await Promise.all([
            Withdrawal.countDocuments(),
            Withdrawal.countDocuments({ status: 'pending' }),
            Withdrawal.countDocuments({ status: 'approved' }),
            Withdrawal.countDocuments({ status: 'completed' }),
            Withdrawal.countDocuments({ status: 'rejected' })
        ]);

        const totalPaidAgg = await Withdrawal.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalPaid = totalPaidAgg[0]?.total || 0;

        const pendingAmountAgg = await Withdrawal.aggregate([
            { $match: { status: { $in: ['pending', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const pendingAmount = pendingAmountAgg[0]?.total || 0;

        return res.json({
            status: 'success',
            data: {
                totalRequests,
                pending: pendingCount,
                approved: approvedCount,
                completed: completedCount,
                rejected: rejectedCount,
                totalPaid,
                pendingAmount
            }
        });
    } catch (error) {
        console.error('Withdrawal stats error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch withdrawal stats' });
    }
};

/**
 * GET /api/admin/withdrawals
 * List all withdrawal requests with filtering and pagination.
 */
export const getAllWithdrawals = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;

        const query = {};

        if (status) {
            query.status = status;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // If search term provided, find matching taskers first
        if (search) {
            const matchingTaskers = await Tasker.find({
                $or: [
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } },
                    { emailAddress: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');

            query.tasker = { $in: matchingTaskers.map(t => t._id) };
        }

        const total = await Withdrawal.countDocuments(query);
        const withdrawals = await Withdrawal.find(query)
            .populate('tasker', 'firstName lastName emailAddress profilePicture')
            .populate('reviewedBy', 'name')
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        return res.json({
            status: 'success',
            results: withdrawals.length,
            totalRecords: total,
            totalPages: Math.ceil(total / Number(limit)),
            currentPage: Number(page),
            withdrawals
        });
    } catch (error) {
        console.error('Get withdrawals error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch withdrawals' });
    }
};

/**
 * GET /api/admin/withdrawals/:id
 * Get a single withdrawal request detail.
 */
export const getWithdrawalById = async (req, res) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id)
            .populate('tasker', 'firstName lastName emailAddress profilePicture wallet bankAccount')
            .populate('reviewedBy', 'name');

        if (!withdrawal) {
            return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });
        }

        return res.json({
            status: 'success',
            data: withdrawal
        });
    } catch (error) {
        console.error('Get withdrawal by id error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch withdrawal' });
    }
};

/**
 * PATCH /api/admin/withdrawals/:id/approve
 * Approve a withdrawal. Admin will manually send the payout.
 */
export const approveWithdrawal = async (req, res) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id);

        if (!withdrawal) {
            return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({
                status: 'error',
                message: `Cannot approve a withdrawal with status '${withdrawal.status}'`
            });
        }

        withdrawal.status = 'approved';
        withdrawal.reviewedBy = req.admin._id;
        withdrawal.reviewedAt = new Date();
        await withdrawal.save();

        await logAdminAction({
            adminId: req.admin._id,
            action: 'APPROVE_WITHDRAWAL',
            resourceType: 'Withdrawal',
            resourceId: withdrawal._id,
            req
        });

        return res.json({
            status: 'success',
            message: 'Withdrawal approved. Proceed with manual payout.',
            data: {
                withdrawalId: withdrawal._id,
                amount: withdrawal.amount,
                status: withdrawal.status,
                bankDetails: withdrawal.bankDetails
            }
        });
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to approve withdrawal' });
    }
};

/**
 * PATCH /api/admin/withdrawals/:id/reject
 * Reject a withdrawal request and refund the amount back to tasker wallet.
 */
export const rejectWithdrawal = async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({
                status: 'error',
                message: 'Rejection reason is required'
            });
        }

        const withdrawal = await Withdrawal.findById(req.params.id);

        if (!withdrawal) {
            return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });
        }

        if (!['pending', 'approved'].includes(withdrawal.status)) {
            return res.status(400).json({
                status: 'error',
                message: `Cannot reject a withdrawal with status '${withdrawal.status}'`
            });
        }

        // Refund the amount back to tasker wallet
        await Tasker.updateOne(
            { _id: withdrawal.tasker },
            { $inc: { wallet: withdrawal.amount } }
        );

        withdrawal.status = 'rejected';
        withdrawal.rejectionReason = reason;
        withdrawal.reviewedBy = req.admin._id;
        withdrawal.reviewedAt = new Date();
        await withdrawal.save();

        await logAdminAction({
            adminId: req.admin._id,
            action: 'REJECT_WITHDRAWAL',
            resourceType: 'Withdrawal',
            resourceId: withdrawal._id,
            req,
            details: { reason }
        });

        return res.json({
            status: 'success',
            message: 'Withdrawal rejected and funds returned to tasker wallet'
        });
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to reject withdrawal' });
    }
};

/**
 * PATCH /api/admin/withdrawals/:id/complete
 * Mark a withdrawal as completed after admin has manually sent the payout.
 */
export const completeWithdrawal = async (req, res) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id);

        if (!withdrawal) {
            return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });
        }

        if (withdrawal.status !== 'approved') {
            return res.status(400).json({
                status: 'error',
                message: `Cannot complete a withdrawal with status '${withdrawal.status}'`
            });
        }

        withdrawal.status = 'completed';
        withdrawal.completedAt = new Date();
        await withdrawal.save();

        // Create transaction record for the manual payout
        await Transaction.create({
            tasker: withdrawal.tasker,
            amount: withdrawal.amount,
            type: 'debit',
            description: `Withdrawal to ${withdrawal.bankDetails.bankName} - ${withdrawal.bankDetails.accountNumber}`,
            status: 'success',
            reference: `WD-${withdrawal._id}`,
            provider: 'system',
            paymentPurpose: 'withdrawal',
            currency: 'NGN',
            metadata: { withdrawalId: withdrawal._id.toString() }
        });

        await logAdminAction({
            adminId: req.admin._id,
            action: 'COMPLETE_WITHDRAWAL',
            resourceType: 'Withdrawal',
            resourceId: withdrawal._id,
            req
        });

        return res.json({
            status: 'success',
            message: 'Withdrawal marked as completed'
        });
    } catch (error) {
        console.error('Complete withdrawal error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to complete withdrawal' });
    }
};
