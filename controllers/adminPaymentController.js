import Task from '../models/task.js';
import User from '../models/user.js';
import Transaction from '../models/transaction.js';
import Withdrawal from '../models/withdrawal.js';
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

        // 1. FETCH EVERYTHING IN PARALLEL (Lightning Fast)
        // Note: Check that your Withdrawal model is actually named 'Withdrawal' and refs 'tasker'
        const [tasks, deposits, withdrawals] = await Promise.all([
            Task.find({ budget: { $gt: 0 }, status: { $in: ['assigned', 'in-progress', 'completed'] } })
                .populate('user', 'fullName emailAddress profilePicture'),
            Transaction.find({ paymentPurpose: 'wallet_funding' })
                .populate('user', 'fullName emailAddress profilePicture'),
            Withdrawal.find({}) 
                .populate('tasker', 'firstName lastName emailAddress profilePicture')
        ]);

        let unifiedLedger = [];

        // 2. STANDARDIZE TASKS (Escrow)
        tasks.forEach(t => {
            unifiedLedger.push({
                _id: t._id,
                user: t.user, // Populated payer
                description: `Task Escrow: ${t.title}`,
                source: 'Task Payment',
                type: t.status === 'completed' ? 'debit' : 'credit',
                amount: t.budget,
                status: t.status === 'completed' ? 'released' : 'held',
                date: t.updatedAt
            });
        });

        // 3. STANDARDIZE DEPOSITS (Wallet Funding)
        deposits.forEach(d => {
            unifiedLedger.push({
                _id: d._id,
                user: d.user, // Populated funder
                description: 'Wallet Deposit via Gateway',
                source: 'Deposit',
                type: 'credit',
                amount: d.amount,
                status: d.status,
                date: d.createdAt
            });
        });

        // 4. STANDARDIZE WITHDRAWALS (Tasker Payouts)
        withdrawals.forEach(w => {
            // Transform tasker data to match the 'User' shape so the frontend table doesn't break
            const taskerObj = w.tasker ? {
                _id: w.tasker._id,
                fullName: `${w.tasker.firstName} ${w.tasker.lastName}`,
                emailAddress: w.tasker.emailAddress,
                profilePicture: w.tasker.profilePicture
            } : null;

            unifiedLedger.push({
                _id: w._id,
                user: taskerObj, 
                description: w.payoutMethod === 'stellar_crypto' ? 'Crypto Withdrawal (XLM)' : 'Bank Withdrawal',
                source: 'Withdrawal',
                type: 'debit',
                amount: w.amount,
                status: w.status,
                date: w.createdAt
            });
        });

        // 5. APPLY FILTERS TO THE UNIFIED ARRAY
        if (type) {
            unifiedLedger = unifiedLedger.filter(item => item.type === type);
        }

        if (search) {
            const lowerSearch = search.toLowerCase();
            unifiedLedger = unifiedLedger.filter(item => 
                item.description.toLowerCase().includes(lowerSearch) ||
                (item.user && item.user.fullName && item.user.fullName.toLowerCase().includes(lowerSearch)) ||
                (item.user && item.user.emailAddress && item.user.emailAddress.toLowerCase().includes(lowerSearch))
            );
        }

        if (startDate || endDate) {
            unifiedLedger = unifiedLedger.filter(item => {
                const itemDate = new Date(item.date);
                const isAfterStart = startDate ? itemDate >= new Date(startDate) : true;
                const isBeforeEnd = endDate ? itemDate <= new Date(endDate) : true;
                return isAfterStart && isBeforeEnd;
            });
        }

        // 6. SORT BY NEWEST DATE
        unifiedLedger.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 7. MATHEMATICAL PAGINATION
        const total = unifiedLedger.length;
        const startIndex = (Number(page) - 1) * Number(limit);
        const endIndex = startIndex + Number(limit);
        const paginatedLedger = unifiedLedger.slice(startIndex, endIndex);

        res.json({
            status: 'success',
            results: paginatedLedger.length,
            totalRecords: total,
            totalPages: Math.ceil(total / Number(limit)),
            currentPage: Number(page),
            transactions: paginatedLedger, 
            data: paginatedLedger 
        });

    } catch (error) {
        console.error('Unified Ledger Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch global ledger' });
    }
};

// GET /api/admin/payments/:id
export const getPaymentById = async (req, res) => {
    try {
        const transactionId = req.params.id; 

        // 1. Search all three ledgers simultaneously (Lightning Fast)
        const [task, deposit, withdrawal] = await Promise.all([
            Task.findById(transactionId).populate('user', 'fullName emailAddress wallet'),
            Transaction.findOne({ _id: transactionId, paymentPurpose: 'wallet_funding' }).populate('user', 'fullName emailAddress wallet'),
            Withdrawal.findById(transactionId).populate('tasker', 'firstName lastName emailAddress wallet')
        ]);

        let record = null;
        let source = '';
        let isDebit = false;
        let amount = 0;
        let description = '';
        let paymentStatus = '';
        let targetUser = null;

        // 2. Identify which database had the matching ID
        if (task) {
            record = task;
            source = 'Task Payment';
            isDebit = task.status === 'completed'; // Released = debit, Held = credit
            amount = task.budget || 0;
            description = `Task Escrow: ${task.title}`;
            paymentStatus = task.status === 'completed' ? 'Released' : 'Held';
            targetUser = task.user;
        } else if (deposit) {
            record = deposit;
            source = 'Deposit';
            isDebit = false; // Money came IN to the platform
            amount = deposit.amount || 0;
            description = 'Wallet Deposit via Gateway';
            paymentStatus = (deposit.status === 'success' || deposit.status === 'completed') ? 'Completed' : 'Pending';
            targetUser = deposit.user;
        } else if (withdrawal) {
            record = withdrawal;
            source = 'Withdrawal';
            isDebit = true; // Money went OUT of the platform
            amount = withdrawal.amount || 0;
            description = withdrawal.payoutMethod === 'stellar_crypto' ? 'Crypto Withdrawal (XLM)' : 'Bank Withdrawal';
            paymentStatus = withdrawal.status === 'completed' ? 'Completed' : 'Pending';
            targetUser = withdrawal.tasker; // For withdrawals, the 'user' is the Tasker
        }

        if (!record) {
            return res.status(404).json({ status: 'error', message: 'Transaction not found in any ledger' });
        }

        // 3. Calculate Ledger Math
        const currentBalance = targetUser?.wallet || 0;
        const previousBalance = isDebit 
            ? currentBalance + amount 
            : currentBalance - amount;

        // 4. Fetch the User/Tasker's 5 Most Recent Activities across ALL ledgers
        const [recentTasks, recentDeposits, recentWithdrawals] = await Promise.all([
            Task.find({ user: targetUser._id, _id: { $ne: transactionId }, budget: { $gt: 0 } }).sort({ updatedAt: -1 }).limit(3),
            Transaction.find({ user: targetUser._id, _id: { $ne: transactionId }, paymentPurpose: 'wallet_funding' }).sort({ createdAt: -1 }).limit(3),
            Withdrawal.find({ tasker: targetUser._id, _id: { $ne: transactionId } }).sort({ createdAt: -1 }).limit(3)
        ]);

        let recentHistory = [];
        recentTasks.forEach(t => recentHistory.push({ description: `Task: ${t.title}`, type: t.status === 'completed' ? 'debit' : 'credit', amount: t.budget, date: t.updatedAt }));
        recentDeposits.forEach(d => recentHistory.push({ description: 'Wallet Deposit', type: 'credit', amount: d.amount, date: d.createdAt }));
        recentWithdrawals.forEach(w => recentHistory.push({ description: 'Withdrawal', type: 'debit', amount: w.amount, date: w.createdAt }));

        // Sort them by newest and slice the top 5 for the UI
        recentHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
        recentHistory = recentHistory.slice(0, 5);

        // 5. Return the unified receipt shape
        res.json({
            status: 'success',
            data: {
                status: paymentStatus,
                amountSign: isDebit ? '-' : '+',
                amount: amount,
                info: {
                    transactionId: record._id,
                    description: description,
                    type: isDebit ? 'debit' : 'credit',
                    paymentMethod: source 
                },
                user: {
                    email: targetUser?.emailAddress || 'Unknown',
                    balanceAfter: currentBalance, 
                    previousBalance: previousBalance, 
                    transactionDate: record.createdAt || record.updatedAt
                },
                recentTransactions: recentHistory
            }
        });

    } catch (error) {
        // Sentry.captureException(error);
        console.error('Get global transaction details error:', error);
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