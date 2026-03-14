import crypto from 'crypto';
import Withdrawal from '../models/withdrawal.js';
import Tasker from '../models/tasker.js';
import Task from '../models/task.js';
import paystackService from '../services/paystack_service.js';

const MINIMUM_WITHDRAWAL = 5000;
const WITHDRAWAL_COOLDOWN_HOURS = 24;

/**
 * GET /api/wallet/tasker/balance
 * Returns the tasker's wallet balance and withdrawable amount.
 * Withdrawable = wallet balance, but only if 24 hours have passed since last completed task.
 */
export const getTaskerBalance = async (req, res) => {
    try {
        // Fresh read to get current wallet balance (req.tasker may be stale)
        const tasker = await Tasker.findById(req.tasker._id).select('wallet bankAccount');
        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        // Find the most recent completed task for this tasker
        const lastCompletedTask = await Task.findOne({
            assignedTasker: req.tasker._id,
            status: 'completed'
        }).sort({ completedAt: -1 }).select('completedAt');

        const now = new Date();
        let withdrawableAmount = 0;
        let canWithdraw = false;
        let nextWithdrawableAt = null;

        if (!lastCompletedTask || !lastCompletedTask.completedAt) {
            // No completed tasks — wallet balance is withdrawable if > 0
            withdrawableAmount = tasker.wallet;
            canWithdraw = tasker.wallet >= MINIMUM_WITHDRAWAL;
        } else {
            const hoursSinceLastTask = (now - lastCompletedTask.completedAt) / (1000 * 60 * 60);

            if (hoursSinceLastTask >= WITHDRAWAL_COOLDOWN_HOURS) {
                withdrawableAmount = tasker.wallet;
                canWithdraw = tasker.wallet >= MINIMUM_WITHDRAWAL;
            } else {
                withdrawableAmount = 0;
                canWithdraw = false;
                nextWithdrawableAt = new Date(lastCompletedTask.completedAt.getTime() + WITHDRAWAL_COOLDOWN_HOURS * 60 * 60 * 1000);
            }
        }

        // Check for pending withdrawals
        const pendingWithdrawal = await Withdrawal.findOne({
            tasker: tasker._id,
            status: { $in: ['pending', 'approved'] }
        });

        if (pendingWithdrawal) {
            canWithdraw = false;
        }

        const hasBankAccount = !!(tasker.bankAccount && tasker.bankAccount.accountNumber);

        return res.json({
            status: 'success',
            data: {
                walletBalance: tasker.wallet,
                withdrawableAmount,
                canWithdraw,
                nextWithdrawableAt,
                minimumWithdrawal: MINIMUM_WITHDRAWAL,
                hasBankAccount,
                hasPendingWithdrawal: !!pendingWithdrawal,
                pendingWithdrawalAmount: pendingWithdrawal?.amount || 0
            }
        });
    } catch (error) {
        console.error('Get tasker balance error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not fetch balance'
        });
    }
};

/**
 * POST /api/wallet/tasker/bank-account
 * Add or update bank account details for withdrawals.
 * Resolves account with Paystack and creates a transfer recipient.
 */
export const setBankAccount = async (req, res) => {
    try {
        const tasker = req.tasker;
        const { accountNumber, bankCode } = req.body;

        if (!accountNumber || !bankCode) {
            return res.status(400).json({
                status: 'error',
                message: 'Account number and bank code are required'
            });
        }

        // Validate account number format (10 digits for Nigerian banks)
        if (!/^\d{10}$/.test(accountNumber)) {
            return res.status(400).json({
                status: 'error',
                message: 'Account number must be 10 digits'
            });
        }

        // Resolve account with Paystack to verify ownership
        const resolved = await paystackService.resolveAccountNumber(accountNumber, bankCode);

        // Get bank name from bank list
        const banks = await paystackService.listBanks();
        const bank = banks.find(b => b.code === bankCode);

        // Update tasker bank account
        tasker.bankAccount = {
            bankName: bank?.name || bankCode,
            bankCode,
            accountNumber,
            accountName: resolved.account_name
        };
        await tasker.save();

        return res.json({
            status: 'success',
            message: 'Bank account saved successfully',
            data: {
                bankName: tasker.bankAccount.bankName,
                accountNumber: tasker.bankAccount.accountNumber,
                accountName: tasker.bankAccount.accountName
            }
        });
    } catch (error) {
        if (error?.name === 'PaystackRequestError') {
            return res.status(400).json({
                status: 'error',
                message: error.publicMessage
            });
        }
        console.error('Set bank account error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not save bank account'
        });
    }
};

/**
 * GET /api/wallet/tasker/bank-account
 * Get the tasker's saved bank account details.
 */
export const getBankAccount = async (req, res) => {
    try {
        const tasker = req.tasker;

        if (!tasker.bankAccount || !tasker.bankAccount.accountNumber) {
            return res.json({
                status: 'success',
                data: null
            });
        }

        return res.json({
            status: 'success',
            data: {
                bankName: tasker.bankAccount.bankName,
                bankCode: tasker.bankAccount.bankCode,
                accountNumber: tasker.bankAccount.accountNumber,
                accountName: tasker.bankAccount.accountName
            }
        });
    } catch (error) {
        console.error('Get bank account error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not fetch bank account'
        });
    }
};

/**
 * POST /api/wallet/tasker/withdraw
 * Request a withdrawal. Goes to admin for approval.
 * Minimum: ₦5,000. Must be 24hrs after last completed task.
 */
export const requestWithdrawal = async (req, res) => {
    try {
        // Fresh read to get current wallet balance
        const tasker = await Tasker.findById(req.tasker._id).select('wallet bankAccount');
        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        const { amount } = req.body;

        const withdrawAmount = Number(amount);
        if (!withdrawAmount || withdrawAmount < MINIMUM_WITHDRAWAL) {
            return res.status(400).json({
                status: 'error',
                message: `Minimum withdrawal amount is ₦${MINIMUM_WITHDRAWAL.toLocaleString()}`
            });
        }

        if (withdrawAmount > tasker.wallet) {
            return res.status(400).json({
                status: 'error',
                message: 'Insufficient wallet balance'
            });
        }

        // Check bank account
        if (!tasker.bankAccount || !tasker.bankAccount.accountNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Please add a bank account before requesting a withdrawal'
            });
        }

        // Check 24hr cooldown since last completed task
        const lastCompletedTask = await Task.findOne({
            assignedTasker: req.tasker._id,
            status: 'completed'
        }).sort({ completedAt: -1 }).select('completedAt');

        if (lastCompletedTask && lastCompletedTask.completedAt) {
            const hoursSinceLast = (Date.now() - lastCompletedTask.completedAt.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLast < WITHDRAWAL_COOLDOWN_HOURS) {
                const nextTime = new Date(lastCompletedTask.completedAt.getTime() + WITHDRAWAL_COOLDOWN_HOURS * 60 * 60 * 1000);
                return res.status(400).json({
                    status: 'error',
                    message: `You can withdraw after ${nextTime.toISOString()}. Must wait 24 hours after last completed task.`
                });
            }
        }

        // Check for existing pending withdrawal
        const existingWithdrawal = await Withdrawal.findOne({
            tasker: req.tasker._id,
            status: { $in: ['pending', 'approved'] }
        });

        if (existingWithdrawal) {
            return res.status(400).json({
                status: 'error',
                message: 'You already have a pending withdrawal request'
            });
        }

        // Atomically deduct from wallet 
        const walletUpdate = await Tasker.updateOne(
            { _id: req.tasker._id, wallet: { $gte: withdrawAmount } },
            { $inc: { wallet: -withdrawAmount } }
        );

        if (!walletUpdate.modifiedCount) {
            return res.status(400).json({
                status: 'error',
                message: 'Insufficient wallet balance'
            });
        }

        // Create withdrawal request
        const withdrawal = await Withdrawal.create({
            tasker: req.tasker._id,
            amount: withdrawAmount,
            status: 'pending',
            bankDetails: {
                bankName: tasker.bankAccount.bankName,
                bankCode: tasker.bankAccount.bankCode,
                accountNumber: tasker.bankAccount.accountNumber,
                accountName: tasker.bankAccount.accountName
            }
        });

        return res.status(201).json({
            status: 'success',
            message: 'Withdrawal request submitted. Awaiting admin approval.',
            data: {
                withdrawalId: withdrawal._id,
                amount: withdrawal.amount,
                status: withdrawal.status,
                bankDetails: withdrawal.bankDetails
            }
        });
    } catch (error) {
        console.error('Request withdrawal error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not process withdrawal request'
        });
    }
};

/**
 * GET /api/wallet/tasker/withdrawals
 * Get tasker's withdrawal history.
 */
export const getWithdrawalHistory = async (req, res) => {
    try {
        const tasker = req.tasker;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const total = await Withdrawal.countDocuments({ tasker: tasker._id });
        const withdrawals = await Withdrawal.find({ tasker: tasker._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return res.json({
            status: 'success',
            results: withdrawals.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            withdrawals
        });
    } catch (error) {
        console.error('Get withdrawal history error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not fetch withdrawal history'
        });
    }
};

/**
 * GET /api/wallet/banks
 * List available banks (public for bank selection dropdowns).
 */
export const listBanks = async (req, res) => {
    try {
        const banks = await paystackService.listBanks();
        const simplified = banks.map(b => ({
            name: b.name,
            code: b.code,
            slug: b.slug
        }));

        return res.json({
            status: 'success',
            data: simplified
        });
    } catch (error) {
        if (error?.name === 'PaystackRequestError') {
            return res.status(502).json({
                status: 'error',
                message: error.publicMessage
            });
        }
        console.error('List banks error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not fetch bank list'
        });
    }
};
