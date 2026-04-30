import Task from '../models/task.js';
import User from '../models/user.js';
import Transaction from '../models/transaction.js';
import { escapeRegex } from '../utils/searchUtils.js';
// import * as Sentry from '@sentry/node'; // Temporarily disabled for pitch safety

const PLATFORM_FEE_RATE = 0.15;

// GET /api/admin/payments/stats
// GET /api/admin/payments/stats
export const getPaymentStats = async (req, res) => {
    try {
        const tasksAgg = await Task.aggregate([
            { 
                $group: { 
                    _id: '$status', 
                    count: { $sum: 1 },
                    totalBudget: { $sum: '$budget' } // Grabs the 10,000s
                } 
            }
        ]);

        const budgetByStatus = { open: 0, assigned: 0, 'in-progress': 0, completed: 0, cancelled: 0 };
        let totalCount = 0;

        tasksAgg.forEach(item => { 
            budgetByStatus[item._id] = item.totalBudget || 0;
            if (['assigned', 'in-progress', 'completed'].includes(item._id)) {
                totalCount += item.count;
            }
        });

        // The actual sum of the money (e.g., 3 tasks * 10,000 = 30,000)
        const sumOfAllTaskPayments = budgetByStatus['assigned'] + budgetByStatus['in-progress'] + budgetByStatus['completed'];
        
        const escrowHeld = budgetByStatus['assigned'] + budgetByStatus['in-progress'];
        const platformFees = budgetByStatus['completed'] * 0.15;
        const taskerPayouts = budgetByStatus['completed'] * 0.85;

        res.json({
            status: 'success',
            data: {
                // FIX: Mapped totalTransactions to the sum (30,000), not the count (3)
                totalTransactions: sumOfAllTaskPayments, 
                totalTransactionsCount: totalCount, // Kept as a fallback just in case
                totalTransactionVolume: sumOfAllTaskPayments,         
                totalCredits: escrowHeld,       
                totalDebits: taskerPayouts,     
                totalPlatformFees: platformFees,
                platformFeeRate: '15%'
            }
        });
    } catch (error) {
        // Sentry.captureException(error);
        console.error('Payment stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch payment stats' });
    }
};

// GET /api/admin/payments
export const getAllPayments = async (req, res) => {
    try {
        const { page = 1, limit = 10, type, search, startDate, endDate } = req.query;

        // FIX: Find tasks where money is involved, regardless of if it's currently held or released
        const query = { escrowAmount: { $gt: 0 } }; 

        if (type === 'credit') {
            query.escrowStatus = 'held';
        } else if (type === 'debit') {
            query.escrowStatus = 'released'; 
        }

        if (search) {
            query.title = { $regex: escapeRegex(search), $options: 'i' };
        }

        if (startDate || endDate) {
            query.updatedAt = {};
            if (startDate) query.updatedAt.$gte = new Date(startDate);
            if (endDate) query.updatedAt.$lte = new Date(endDate);
        }

        // OPTIMIZATION: Fire in parallel so it loads instantly for the judges
        const [tasks, total] = await Promise.all([
            Task.find(query)
                .populate('user', 'fullName emailAddress profilePicture') 
                .select('title escrowAmount escrowStatus createdAt updatedAt user')
                .sort({ updatedAt: -1 })
                .limit(Number(limit))
                .skip((Number(page) - 1) * Number(limit)),
            Task.countDocuments(query)
        ]);

        const transactions = tasks.map(task => {
            const isDebit = task.escrowStatus === 'released';
            
            return {
                _id: task._id,
                user: task.user, 
                description: `Escrow for: ${task.title}`, 
                type: isDebit ? 'debit' : 'credit', 
                amount: task.escrowAmount, 
                date: task.updatedAt, 
                status: task.escrowStatus 
            };
        });

        res.json({
            status: 'success',
            results: transactions.length,
            totalRecords: total,
            totalPages: Math.ceil(total / Number(limit)),
            currentPage: Number(page),
            transactions, 
            data: transactions // FIX: Added 'data' array fallback in case frontend expects it
        });

    } catch (error) {
        // Sentry.captureException(error);
        console.error('Payment history error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch payment history' });
    }
};

export const getPaymentById = async (req, res) => {
    try {
        const transactionId = req.params.id; 

        const task = await Task.findById(transactionId)
            .populate('user', 'emailAddress wallet'); 

        if (!task) {
            return res.status(404).json({ status: 'error', message: 'Transaction not found' });
        }

        const isDebit = task.escrowStatus === 'released';
        const type = isDebit ? 'debit' : 'credit';
        const amount = task.escrowAmount || 0;
        const currentBalance = task.user.wallet || 0;
        
        const previousBalance = isDebit 
            ? currentBalance + amount 
            : currentBalance - amount;

        const recentTasks = await Task.find({
                user: task.user._id,
                _id: { $ne: task._id }, 
                escrowAmount: { $gt: 0 } // FIX: match the new query logic
            })
            .sort({ updatedAt: -1 })
            .limit(5);

        const recentHistory = recentTasks.map(t => ({
            description: `Payment for ${t.title}`,
            type: t.escrowStatus === 'released' ? 'debit' : 'credit',
            amount: t.escrowAmount,
            date: t.updatedAt
        }));

        res.json({
            status: 'success',
            data: {
                status: task.escrowStatus === 'released' ? 'Completed' : 'Pending',
                amountSign: isDebit ? '-' : '+',
                amount: amount,
                info: {
                    transactionId: task._id,
                    description: `Payment for ${task.title}`,
                    type: type,
                    paymentMethod: 'Wallet' 
                },
                user: {
                    email: task.user.emailAddress,
                    balanceAfter: currentBalance, 
                    previousBalance: previousBalance, 
                    transactionDate: task.updatedAt
                },
                recentTransactions: recentHistory
            }
        });

    } catch (error) {
        // Sentry.captureException(error);
        console.error('Get transaction details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch transaction details' });
    }
};

export const getDepositStats = async (req, res) => {
    try {
        const depositFilter = { paymentPurpose: 'wallet_funding' };

        const [
            totalDeposits, successCount, pendingCount, failedCount, totalAmountAgg, pendingAmountAgg
        ] = await Promise.all([
            Transaction.countDocuments(depositFilter),
            Transaction.countDocuments({ ...depositFilter, status: 'success' }),
            Transaction.countDocuments({ ...depositFilter, status: 'pending' }),
            Transaction.countDocuments({ ...depositFilter, status: 'failed' }),
            Transaction.aggregate([
                { $match: { ...depositFilter, status: 'success' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Transaction.aggregate([
                { $match: { ...depositFilter, status: 'pending' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        const totalAmount = totalAmountAgg[0]?.total || 0;
        const pendingAmount = pendingAmountAgg[0]?.total || 0;

        return res.json({
            status: 'success',
            data: {
                totalDeposits,
                success: successCount,
                pending: pendingCount,
                failed: failedCount,
                totalAmount,
                pendingAmount
            }
        });
    } catch (error) {
        // Sentry.captureException(error);
        console.error('Deposit stats error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch deposit stats' });
    }
};

export const getAllDeposits = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;

        const query = { paymentPurpose: 'wallet_funding' };

        if (status && ['success', 'pending', 'failed'].includes(status)) {
            query.status = status;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            const escaped = escapeRegex(search);
            const matchingUsers = await User.find({
                $or: [
                    { fullName: { $regex: escaped, $options: 'i' } },
                    { emailAddress: { $regex: escaped, $options: 'i' } }
                ]
            }).select('_id');
            query.user = { $in: matchingUsers.map(u => u._id) };
        }

        // OPTIMIZED to load instantly
        const [total, deposits] = await Promise.all([
            Transaction.countDocuments(query),
            Transaction.find(query)
                .populate('user', 'fullName emailAddress profilePicture')
                .sort({ createdAt: -1 })
                .limit(Number(limit))
                .skip((Number(page) - 1) * Number(limit))
                .select('user amount type status reference provider paymentPurpose currency gatewayResponse createdAt verifiedAt creditedAt')
        ]);

        return res.json({
            status: 'success',
            results: deposits.length,
            totalRecords: total,
            totalPages: Math.ceil(total / Number(limit)),
            currentPage: Number(page),
            deposits,
            data: deposits // FIX: Fallback property for the UI
        });
    } catch (error) {
        // Sentry.captureException(error);
        console.error('Get deposits error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch deposits' });
    }
};

export const getDepositById = async (req, res) => {
    try {
        const deposit = await Transaction.findOne({
            _id: req.params.id,
            paymentPurpose: 'wallet_funding'
        }).populate('user', 'fullName emailAddress profilePicture wallet');

        if (!deposit) {
            return res.status(404).json({ status: 'error', message: 'Deposit not found' });
        }

        return res.json({
            status: 'success',
            data: deposit
        });
    } catch (error) {
        // Sentry.captureException(error);
        console.error('Get deposit by id error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch deposit details' });
    }
};