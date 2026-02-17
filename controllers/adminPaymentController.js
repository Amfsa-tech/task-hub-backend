import Task from '../models/task.js';
import User from '../models/user.js';

// GET /api/admin/payments/stats
export const getPaymentStats = async (req, res) => {
    try {
        // --- ADAPTING TASK DATA TO FIT "CREDIT/DEBIT" UI ---

        // 1. "Total Credits" (Money In)
        // We assume any task where money was held counts as money entering the system.
        const creditAgg = await Task.aggregate([
            { $match: { isEscrowHeld: true } },
            { $group: { _id: null, total: { $sum: '$escrowAmount' } } }
        ]);
        const totalCredits = creditAgg[0]?.total || 0;

        // 2. "Total Debits" (Money Out)
        // We assume money released to a Tasker counts as money leaving the system bucket.
        const debitAgg = await Task.aggregate([
            { $match: { escrowStatus: 'released' } },
            { $group: { _id: null, total: { $sum: '$escrowAmount' } } }
        ]);
        const totalDebits = debitAgg[0]?.total || 0;

        // 3. "Net Flow"
        const netFlow = totalCredits - totalDebits;

        // 4. "Total Transactions"
        const totalTransactions = await Task.countDocuments({ isEscrowHeld: true });

        res.json({
            status: 'success',
            data: {
                totalTransactions,
                totalCredits, // Matches UI Card 2
                totalDebits,  // Matches UI Card 3
                netFlow       // Matches UI Card 4
            }
        });
    } catch (error) {
        console.error('Payment stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch payment stats' });
    }
};

// GET /api/admin/payments
export const getAllPayments = async (req, res) => {
    try {
        const { page = 1, limit = 10, type, search, startDate, endDate } = req.query;

        // 1. Build Query
        const query = { isEscrowHeld: true }; // Only show tasks involving money

        // Filter by Type (Mapping UI 'credit'/'debit' to Task Status)
        if (type === 'credit') {
            query.escrowStatus = 'held'; // Money currently sitting in system
        } else if (type === 'debit') {
            query.escrowStatus = 'released'; // Money paid out
        }

        // Search Filter
        if (search) {
            query.title = { $regex: search, $options: 'i' };
        }

        // Date Filter
        if (startDate || endDate) {
            query.updatedAt = {};
            if (startDate) query.updatedAt.$gte = new Date(startDate);
            if (endDate) query.updatedAt.$lte = new Date(endDate);
        }

        // 2. Execute Query
        const tasks = await Task.find(query)
            .populate('user', 'fullName emailAddress profilePicture') // Payer
            .select('title escrowAmount escrowStatus createdAt updatedAt user')
            .sort({ updatedAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Task.countDocuments(query);

        // 3. MAP TASKS TO "TRANSACTION" UI FORMAT
        const transactions = tasks.map(task => {
            // Determine if this looks like a Credit or Debit for the UI badge
            const isDebit = task.escrowStatus === 'released';
            
            return {
                _id: task._id,
                user: task.user, // Matches "USER" column
                description: `Escrow for: ${task.title}`, // Matches "DESCRIPTION" column
                type: isDebit ? 'debit' : 'credit', // Matches "TYPE" column (Red/Green badge)
                amount: task.escrowAmount, // Matches "AMOUNT" column
                date: task.updatedAt, // Matches "DATE" column
                status: task.escrowStatus // Keep distinct status if needed
            };
        });

        res.json({
            status: 'success',
            results: transactions.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            transactions // Returning the mapped array
        });

    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch payment history' });
    }
};
export const getPaymentById = async (req, res) => {
    try {
        const transactionId = req.params.id; // This is actually the Task ID

        // 1. Fetch the "Transaction" (Task)
        const task = await Task.findById(transactionId)
            .populate('user', 'emailAddress walletBalance'); // Fetch user's email & current balance

        if (!task) {
            return res.status(404).json({ status: 'error', message: 'Transaction not found' });
        }

        // 2. Determine Transaction Attributes (Simulated)
        // If money is released, it's a "Debit" (Out). If held, it's a "Credit" (In).
        const isDebit = task.escrowStatus === 'released';
        const type = isDebit ? 'debit' : 'credit';
        const amount = task.escrowAmount || 0;

        // 3. Calculate "Snapshot" Balances (Estimation)
        // Since we don't have a real ledger, we estimate "Previous Balance" based on current wallet.
        const currentBalance = task.user.walletBalance || 0; // "Balance After Transaction"
        
        // If it was a Debit (User spent money), Previous was likely Higher.
        // If it was a Credit (User refunded), Previous was likely Lower.
        const previousBalance = isDebit 
            ? currentBalance + amount 
            : currentBalance - amount;

        // 4. Fetch "Recent Transactions from This User" (Bottom Table)
        const recentTasks = await Task.find({
                user: task.user._id,
                _id: { $ne: task._id }, // Exclude current one
                isEscrowHeld: true // Only financial tasks
            })
            .sort({ updatedAt: -1 })
            .limit(5);

        // Map recent tasks to transaction format
        const recentHistory = recentTasks.map(t => ({
            description: `Payment for ${t.title}`,
            type: t.escrowStatus === 'released' ? 'debit' : 'credit',
            amount: t.escrowAmount,
            date: t.updatedAt
        }));

        res.json({
            status: 'success',
            data: {
                // Header Badge
                status: task.escrowStatus === 'released' ? 'Completed' : 'Pending',

                // Main Big Amount
                amountSign: isDebit ? '-' : '+',
                amount: amount,

                // Left Column: Transaction Info
                info: {
                    transactionId: task._id,
                    description: `Payment for ${task.title}`,
                    type: type, // 'debit' or 'credit'
                    paymentMethod: 'Wallet' // Hardcoded for now
                },

                // Right Column: User & Balance Details
                user: {
                    email: task.user.emailAddress,
                    balanceAfter: currentBalance, // N215,000
                    previousBalance: previousBalance, // N250,000 (Calculated)
                    transactionDate: task.updatedAt
                },

                // Bottom Section: Recent Transactions
                recentTransactions: recentHistory
            }
        });

    } catch (error) {
        console.error('Get transaction details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch transaction details' });
    }
};