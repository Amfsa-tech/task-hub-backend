import crypto from 'crypto';
import Withdrawal from '../models/withdrawal.js';
import Tasker from '../models/tasker.js';
import Task from '../models/task.js';
import paystackService from '../services/paystack_service.js';
import flutterwaveService from '../services/flutterwave_service.js';
import AdminSettings from '../models/adminSettings.js';
import * as Sentry from '@sentry/node';
import { notifyWithdrawalRequested } from '../utils/notificationUtils.js';

const MINIMUM_WITHDRAWAL = 500;
const WITHDRAWAL_COOLDOWN_HOURS = 24;

// Dynamically route bank queries to the active gateway
const getActiveGateway = async () => {
    let settings = await AdminSettings.findOne();
    if (!settings) settings = await AdminSettings.create({});
    
    const providerName = settings.payments?.activeFiatGateway || 'flutterwave';
    const service = providerName === 'paystack' ? paystackService : flutterwaveService;
    return { providerName, service };
};

export const getTaskerBalance = async (req, res) => {
    try {
        const authId = req.tasker ? req.tasker._id : req.user._id;
        const tasker = await Tasker.findById(authId).select('wallet bankAccount');
        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        const lastCompletedTask = await Task.findOne({
            assignedTasker: tasker._id,
            status: 'completed'
        }).sort({ completedAt: -1 }).select('completedAt');

        const now = new Date();
        let withdrawableAmount = 0;
        let canWithdraw = false;
        let nextWithdrawableAt = null;

        if (!lastCompletedTask || !lastCompletedTask.completedAt) {
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
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Could not fetch balance' });
    }
};

export const setBankAccount = async (req, res) => {
    try {
        const authId = req.tasker ? req.tasker._id : req.user._id;
        const tasker = await Tasker.findById(authId);
        const { accountNumber, bankCode } = req.body;

        if (!accountNumber || !bankCode) {
            return res.status(400).json({ status: 'error', message: 'Account number and bank code are required' });
        }

        if (!/^\d{10}$/.test(accountNumber)) {
            return res.status(400).json({ status: 'error', message: 'Account number must be 10 digits' });
        }

        // Dynamically resolve the account using Flutterwave (or Paystack if switched)
        const { service } = await getActiveGateway();
        const resolved = await service.resolveAccountNumber(accountNumber, bankCode);
        const banks = await service.listBanks();
        const bank = banks.find(b => b.code === bankCode);

        tasker.bankAccount = {
            bankName: bank?.name || bankCode,
            bankCode,
            accountNumber,
            accountName: resolved.account_name || resolved.accountName // Handle both FLW and Paystack response shapes
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
        console.error('Set bank account error:', error);
        Sentry.captureException(error);
        return res.status(400).json({ status: 'error', message: 'Could not verify bank account details' });
    }
};

export const getBankAccount = async (req, res) => {
    try {
        const authId = req.tasker ? req.tasker._id : req.user._id;
        const tasker = await Tasker.findById(authId).select('bankAccount');

        if (!tasker || !tasker.bankAccount || !tasker.bankAccount.accountNumber) {
            return res.json({ status: 'success', data: null });
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
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Could not fetch bank account' });
    }
};

<<<<<<< HEAD
/**
 * POST /api/wallet/tasker/withdraw
 * Request a withdrawal. Goes to admin for approval.
 * Minimum: ₦500. Must be 24hrs after last completed task.
 */
=======
>>>>>>> 7753ca6c5600ffb59660b3b17a1a47a1701630e7
export const requestWithdrawal = async (req, res) => {
    try {
        const authId = req.tasker ? req.tasker._id : req.user._id; 
        const tasker = await Tasker.findById(authId).select('wallet bankAccount');
        
        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        const { amount, payoutMethod, stellarAddress } = req.body;
        const withdrawAmount = Number(amount);
        
        if (!withdrawAmount || withdrawAmount < MINIMUM_WITHDRAWAL) {
            return res.status(400).json({
                status: 'error',
                message: `Minimum withdrawal amount is ₦${MINIMUM_WITHDRAWAL.toLocaleString()}`
            });
        }

        if (withdrawAmount > tasker.wallet) {
            return res.status(400).json({ status: 'error', message: 'Insufficient wallet balance' });
        }

        const existingWithdrawal = await Withdrawal.findOne({
            tasker: authId,
            status: { $in: ['pending', 'approved'] }
        });

        if (existingWithdrawal) {
            return res.status(400).json({ status: 'error', message: 'You already have a pending withdrawal request' });
        }

        // Snapshot balances to sync correctly with Admin Dashboard logic
        const prevBal = tasker.wallet || 0;
        const newBal = prevBal - withdrawAmount;

        const withdrawalData = {
            tasker: authId,
            amount: withdrawAmount,
            status: 'pending',
            payoutMethod: payoutMethod || 'bank_transfer',
            previousBalance: prevBal, 
            balanceAfter: newBal     
        };

        if (payoutMethod === 'stellar_crypto') {
            if (!stellarAddress) {
                return res.status(400).json({ status: 'error', message: 'Stellar wallet address is required' });
            }
            withdrawalData.stellarDetails = { publicKey: stellarAddress };
        } else {
            if (!tasker.bankAccount || !tasker.bankAccount.accountNumber) {
                return res.status(400).json({ status: 'error', message: 'Please add a bank account first' });
            }
            withdrawalData.bankDetails = {
                bankName: tasker.bankAccount.bankName,
                bankCode: tasker.bankAccount.bankCode,
                accountNumber: tasker.bankAccount.accountNumber,
                accountName: tasker.bankAccount.accountName
            };
        }

        const withdrawal = await Withdrawal.create(withdrawalData);

        // Deduct from wallet
        tasker.wallet = newBal;
        await tasker.save();

        try {
            await notifyWithdrawalRequested(authId, withdrawAmount, payoutMethod || 'bank_transfer');
        } catch (notifyErr) {
            console.error('Failed to send withdrawal request notification:', notifyErr);
        }

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
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Could not process withdrawal request' });
    }
};

export const getWithdrawalHistory = async (req, res) => {
    try {
        const authId = req.tasker ? req.tasker._id : req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const total = await Withdrawal.countDocuments({ tasker: authId });
        const withdrawals = await Withdrawal.find({ tasker: authId })
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
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Could not fetch withdrawal history' });
    }
};

export const listBanks = async (req, res) => {
    try {
        // Fetch dynamically from Flutterwave or Paystack
        const { service } = await getActiveGateway();
        const banks = await service.listBanks();
        
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
        console.error('List banks error:', error);
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Could not fetch bank list.' });
    }
};