import crypto from 'crypto';
import Transaction from '../models/transaction.js';
import User from '../models/user.js';
import Withdrawal from '../models/withdrawal.js';
import paystackService from '../services/paystack_service.js';
import AdminSettings from '../models/adminSettings.js';
import bcrypt from 'bcryptjs';
import Tasker from '../models/tasker.js';
import flutterwaveService from '../services/flutterwave_service.js';
import axios from 'axios'; 
import * as Sentry from '@sentry/node';
import { notifyWalletFunded } from '../utils/notificationUtils.js';

// Helper to get active gateway
const getActiveGateway = async () => {
    let settings = await AdminSettings.findOne();
    if (!settings) settings = await AdminSettings.create({});
    
    const providerName = settings.payments?.activeFiatGateway || 'flutterwave';
    const service = providerName === 'paystack' ? paystackService : flutterwaveService;
    return { providerName, service };
};

/**
 * GET /api/wallet/banks
 * Fetches the official list of Nigerian banks from Paystack or Flutterwave
 */
export const getBanks = async (req, res) => {
    try {
        const { service } = await getActiveGateway();
        const banks = await service.listBanks();
        
        return res.status(200).json({
            status: 'success',
            data: banks.map(b => ({ name: b.name, code: b.code }))
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Fetch banks error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch bank list' });
    }
};

/**
 * GET /api/wallet/tasker/bank-account
 * Fetches the tasker's saved bank account details
 */
export const getTaskerBankAccount = async (req, res) => {
    try {
        const tasker = await Tasker.findById(req.user._id).select('bankAccount');
        
        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        return res.status(200).json({
            status: 'success',
            data: tasker.bankAccount || null 
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Get bank account error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch bank account details' });
    }
};

export const initializeFunding = async (req, res) => {
    try {
        const { amount } = req.body;
        const user = req.user;

        const nairaAmount = Number(amount);
        if (isNaN(nairaAmount) || nairaAmount < 100) {
            return res.status(400).json({ status: 'error', message: 'Minimum funding amount is ₦100' });
        }

        const { providerName, service } = await getActiveGateway();
        // Convert to kobo (Standard backend storage format)
        const koboAmount = Math.round(nairaAmount * 100); 
        const reference = `WF-${user._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        const transaction = await Transaction.create({
            user: user._id,
            amount: nairaAmount,
            type: 'credit',
            description: `Wallet funding via ${providerName.toUpperCase()}`,
            status: 'pending',
            reference,
            provider: providerName,
            paymentPurpose: 'wallet_funding',
            currency: 'NGN',
            metadata: { initiatedAt: new Date().toISOString() },
        });

        const gatewayData = await service.initializeTransaction({
            email: user.emailAddress,
            amount: koboAmount,
            reference,
            metadata: {
                userId: user._id.toString(),
                transactionId: transaction._id.toString(),
                purpose: 'wallet_funding',
            },
        });

        return res.status(200).json({
            status: 'success',
            message: `Payment initialized via ${providerName}`,
            data: {
                authorizationUrl: gatewayData.authorization_url,
                reference,
                provider: providerName
            },
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('[Wallet Fund] Initialize error:', error);
        return res.status(500).json({ status: 'error', message: error.publicMessage || 'Could not initialize payment' });
    }
};

/**
 * GET /api/wallet/fund/verify?reference=...
 * Frontend calls this after redirect to check payment state.
 */
export const verifyFunding = async (req, res) => {
    try {
        const { reference } = req.query;
        const user = req.user;

        if (!reference) return res.status(400).json({ status: 'error', message: 'Reference is required' });

        const transaction = await Transaction.findOne({ reference, user: user._id });
        if (!transaction) return res.status(404).json({ status: 'error', message: 'Transaction not found' });

        if (transaction.status === 'success' || transaction.status === 'failed') {
            return res.status(200).json({
                status: 'success',
                message: `Payment previously processed as ${transaction.status}`,
                data: { reference: transaction.reference, transactionStatus: transaction.status },
            });
        }

        const service = transaction.provider === 'paystack' ? paystackService : flutterwaveService;
        const gatewayData = await service.verifyTransaction(reference);

        if (gatewayData.status === 'success') {
            const expectedKobo = Math.round(transaction.amount * 100);
            if (gatewayData.amount !== expectedKobo) {
                 return res.status(400).json({ status: 'error', message: 'Value mismatch detected' });
            }

            // Perform the snapshot and credit
            await creditWallet(transaction, gatewayData);
            const updated = await Transaction.findById(transaction._id);

            return res.status(200).json({
                status: 'success',
                message: 'Payment verified and wallet credited',
                data: { reference: updated.reference, transactionStatus: updated.status },
            });
        }

        if (gatewayData.status === 'failed' || gatewayData.status === 'reversed') {
            transaction.status = 'failed';
            transaction.gatewayResponse = gatewayData.gateway_response;
            transaction.verifiedAt = new Date();
            await transaction.save();
        }

        return res.status(200).json({
            status: 'success',
            message: `Payment status: ${gatewayData.status}`,
            data: { reference: transaction.reference, transactionStatus: 'pending' },
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('[Wallet Fund] Verify error:', error);
        return res.status(500).json({ status: 'error', message: 'Could not verify payment' });
    }
};

/**
 * Credits the user's wallet atomically using findOneAndUpdate for idempotency.
 * THIS FIXES THE ADMIN DASHBOARD DISPLAY.
 */
export const creditWallet = async (transaction, gatewayData) => {
    if (transaction.status === 'success') return;

    const user = await User.findById(transaction.user);
    if (!user) return;

    const previousBalance = user.wallet || 0;
    const newBalance = previousBalance + transaction.amount;

    user.wallet = newBalance;
    await user.save();

    const txn = await Transaction.findOneAndUpdate(
        { _id: transaction._id, status: 'pending' },
        {
            status: 'success', 
            providerTransactionId: String(gatewayData.id),
            gatewayResponse: gatewayData.gateway_response,
            verifiedAt: new Date(),
            creditedAt: new Date(),
            previousBalance: previousBalance, 
            balanceAfter: newBalance,         
            metadata: {
                ...transaction.metadata,
                channel: gatewayData.channel,
                paidAt: gatewayData.paid_at,
            },
        },
        { new: true }
    );

    if (txn) {
        try {
            await notifyWalletFunded(txn.user.toString(), txn.amount, txn.provider);
        } catch (notifyErr) {
            console.error('Notification Error:', notifyErr);
        }
    }
};

/**
 * GET /api/wallet/user/balance
 */
export const getUserBalance = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('wallet');
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        const escrowResult = await (await import('../models/task.js')).default.aggregate([
            { $match: { user: user._id, isEscrowHeld: true } },
            { $group: { _id: null, totalEscrow: { $sum: '$escrowAmount' } } }
        ]);
        const totalEscrow = escrowResult.length > 0 ? escrowResult[0].totalEscrow : 0;

        return res.json({
            status: 'success',
            data: {
                walletBalance: user.wallet,
                totalInEscrow: totalEscrow,
                availableBalance: user.wallet
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Get user balance error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not fetch balance'
        });
    }
};

/**
 * GET /api/wallet/user/transactions?page=1&limit=10
 */
export const getUserTransactions = async (req, res) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = { user: userId };

        if (req.query.purpose) {
            const validPurposes = ['wallet_funding', 'escrow_hold', 'escrow_release', 'escrow_refund', 'platform_fee'];
            if (validPurposes.includes(req.query.purpose)) {
                filter.paymentPurpose = req.query.purpose;
            }
        }

        const total = await Transaction.countDocuments(filter);
        const transactions = await Transaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('amount type description status reference paymentPurpose createdAt metadata previousBalance balanceAfter');

        return res.json({
            status: 'success',
            results: transactions.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            transactions
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Get user transactions error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not fetch transactions'
        });
    }
};

// ==========================================
// NEW: STELLAR CRYPTO DEPOSIT & WITHDRAWAL
// ==========================================

/**
 * GET /api/wallet/stellar/deposit-info
 */
export const getStellarDepositInfo = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        if (!user.stellarMemoId) {
            user.stellarMemoId = crypto.randomBytes(4).toString('hex').toUpperCase();
            await user.save();
        }

        return res.json({
            status: 'success',
            data: {
                masterWalletAddress: process.env.STELLAR_MASTER_PUBLIC_KEY,
                userMemoId: user.stellarMemoId,
                network: process.env.STELLAR_NETWORK || 'TESTNET',
                exchangeRate: 1500 
            }
        });
    } catch (error) {
        console.error('Get deposit info error:', error);
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch deposit details' });
    }
};

/**
 * POST /api/wallet/withdraw
 * Creates a withdrawal request (Crypto or Bank) and deducts funds from the TASKER's wallet
 */
export const requestWithdrawal = async (req, res) => {
    try {
        const authId = req.tasker ? req.tasker._id : req.user._id; 
        const tasker = await Tasker.findById(authId).select('wallet bankAccount');
        
        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        const { amount, payoutMethod, stellarAddress } = req.body;
        const withdrawAmount = Number(amount);
        
        if (!withdrawAmount || withdrawAmount < 5000) {
            return res.status(400).json({
                status: 'error',
                message: `Minimum withdrawal amount is ₦5,000`
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

export const setupTransactionPin = async (req, res) => {
    try {
        const { pin, password } = req.body; 
        const taskerId = req.user._id;

        if (!pin || !/^\d{4}$/.test(pin)) {
            return res.status(400).json({ status: 'error', message: 'PIN must be exactly 4 digits' });
        }

        const tasker = await Tasker.findById(taskerId);
        if (!tasker) return res.status(404).json({ status: 'error', message: 'Tasker not found' });

        const isPasswordValid = await bcrypt.compare(password, tasker.password);
        if (!isPasswordValid) {
            return res.status(401).json({ status: 'error', message: 'Incorrect account password' });
        }

        const salt = await bcrypt.genSalt(10);
        tasker.transactionPin = await bcrypt.hash(pin.toString(), salt);
        await tasker.save();

        return res.json({
            status: 'success',
            message: 'Transaction PIN set successfully. You can now withdraw funds.'
        });

    } catch (error) {
        console.error('Setup PIN error:', error);
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Failed to set PIN' });
    }
};

/**
 * GET /api/wallet/tasker/balance
 */
export const getTaskerBalance = async (req, res) => {
    try {
        const tasker = await Tasker.findById(req.user._id).select('wallet');
        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        const pendingWithdrawalsAgg = await Withdrawal.aggregate([
            { $match: { tasker: tasker._id, status: { $in: ['pending', 'processing', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const pendingWithdrawals = pendingWithdrawalsAgg[0]?.total || 0;

        return res.json({
            status: 'success',
            data: {
                walletBalance: tasker.wallet,
                pendingWithdrawals: pendingWithdrawals,
                availableToWithdraw: tasker.wallet 
            }
        });
    } catch (error) {
        console.error('Get tasker balance error:', error);
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Could not fetch balance' });
    }
};

/**
 * GET /api/wallet/tasker/transactions?page=1&limit=10
 */
export const getTaskerTransactions = async (req, res) => {
    try {
        const taskerId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = { tasker: taskerId };

        const total = await Transaction.countDocuments(filter);
        const transactions = await Transaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('amount type description status reference paymentPurpose createdAt metadata previousBalance balanceAfter');

        return res.json({
            status: 'success',
            results: transactions.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            transactions
        });
    } catch (error) {
        console.error('Get tasker transactions error:', error);
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Could not fetch transactions' });
    }
};