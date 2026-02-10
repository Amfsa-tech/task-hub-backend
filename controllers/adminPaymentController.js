import Task from '../models/task.js';

export const getPaymentStats = async (req, res) => {
    try {
        // Total revenue (completed + escrow released)
        const revenueAgg = await Task.aggregate([
            {
                $match: {
                    status: 'completed',
                    escrowStatus: 'released'
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$escrowAmount' }
                }
            }
        ]);

        const totalRevenue = revenueAgg[0]?.totalRevenue || 0;

        // Escrow currently held
        const escrowHeldAgg = await Task.aggregate([
            {
                $match: {
                    isEscrowHeld: true,
                    escrowStatus: 'held'
                }
            },
            {
                $group: {
                    _id: null,
                    totalHeld: { $sum: '$escrowAmount' }
                }
            }
        ]);

        const escrowHeld = escrowHeldAgg[0]?.totalHeld || 0;

        // Refunded escrow
        const refundedAgg = await Task.aggregate([
            {
                $match: {
                    escrowStatus: 'refunded'
                }
            },
            {
                $group: {
                    _id: null,
                    totalRefunded: { $sum: '$escrowAmount' }
                }
            }
        ]);

        const refunded = refundedAgg[0]?.totalRefunded || 0;

        res.json({
            status: 'success',
            data: {
                revenue: {
                    total: totalRevenue
                },
                escrow: {
                    held: escrowHeld,
                    refunded
                }
            }
        });
    } catch (error) {
        console.error('Payment stats error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch payment statistics'
        });
    }
};
