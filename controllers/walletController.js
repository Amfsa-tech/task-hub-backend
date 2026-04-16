import crypto from 'crypto';
import Transaction from '../models/transaction.js';
import User from '../models/user.js';
import Withdrawal from '../models/withdrawal.js'; // NEW IMPORT
import paystackService from '../services/paystack_service.js';
import bcrypt from 'bcryptjs'; // NEW IMPORT
import Tasker from '../models/tasker.js';

/**
 * POST /api/wallet/fund/initialize
 * Creates a pending transaction and returns a Paystack authorization URL.
 * Requires: protectUser middleware (req.user populated)
 */
export const initializeFunding = async (req, res) => {
    try {
        const { amount } = req.body;
        const user = req.user;

        // Validate amount (expect Naira from client, convert to kobo for Paystack)
        const nairaAmount = Number(amount);
        if (isNaN(nairaAmount)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid amount value',
            });
        }
        if (nairaAmount < 100) {
            return res.status(400).json({
                status: 'error',
                message: 'Minimum funding amount is ₦100',
            });
        }

        const koboAmount = Math.round(nairaAmount * 100);
        const reference = `WF-${user._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        // Create a pending transaction record
        const transaction = await Transaction.create({
            user: user._id,
            amount: nairaAmount,
            type: 'credit',
            description: 'Wallet funding via Paystack',
            status: 'pending',
            reference,
            provider: 'paystack',
            paymentPurpose: 'wallet_funding',
            currency: 'NGN',
            metadata: { initiatedAt: new Date().toISOString() },
        });

        // Initialize with Paystack
        const paystackData = await paystackService.initializeTransaction({
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
            message: 'Payment initialized',
            data: {
                authorizationUrl: paystackData.authorization_url,
                accessCode: paystackData.access_code,
                reference,
            },
        });
    } catch (error) {
        if (error?.name === 'PaystackRequestError') {
            console.error('[Wallet Fund] Initialize error:', {
                message: error.message,
                statusCode: error.statusCode,
                details: error.details,
            });
            return res.status(502).json({
                status: 'error',
                message: error.publicMessage,
            });
        }

        console.error('[Wallet Fund] Initialize error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not initialize payment',
        });
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

        if (!reference) {
            return res.status(400).json({
                status: 'error',
                message: 'Reference is required',
            });
        }

        // Find the internal transaction
        const transaction = await Transaction.findOne({ reference, user: user._id });

        if (!transaction) {
            return res.status(404).json({
                status: 'error',
                message: 'Transaction not found',
            });
        }

        // Already processed — return current state
        if (transaction.status === 'success') {
            return res.status(200).json({
                status: 'success',
                message: 'Payment already verified and credited',
                data: {
                    reference: transaction.reference,
                    amount: transaction.amount,
                    transactionStatus: transaction.status,
                    creditedAt: transaction.creditedAt,
                },
            });
        }

        if (transaction.status === 'failed') {
            return res.status(200).json({
                status: 'success',
                message: 'Payment failed',
                data: {
                    reference: transaction.reference,
                    amount: transaction.amount,
                    transactionStatus: transaction.status,
                },
            });
        }

        // Still pending — verify with Paystack
        const paystackData = await paystackService.verifyTransaction(reference);

        if (paystackData.status === 'success') {
            await creditWallet(transaction, paystackData);
            const updated = await Transaction.findById(transaction._id);

            return res.status(200).json({
                status: 'success',
                message: 'Payment verified and wallet credited',
                data: {
                    reference: updated.reference,
                    amount: updated.amount,
                    transactionStatus: updated.status,
                    creditedAt: updated.creditedAt,
                },
            });
        }

        // Payment not yet successful on Paystack side
        if (paystackData.status === 'failed' || paystackData.status === 'reversed') {
            transaction.status = 'failed';
            transaction.gatewayResponse = paystackData.gateway_response;
            transaction.verifiedAt = new Date();
            await transaction.save();
        }

        return res.status(200).json({
            status: 'success',
            message: `Payment status: ${paystackData.status}`,
            data: {
                reference: transaction.reference,
                amount: transaction.amount,
                transactionStatus: paystackData.status === 'failed' || paystackData.status === 'reversed'
                    ? 'failed'
                    : 'pending',
            },
        });
    } catch (error) {
        if (error?.name === 'PaystackRequestError') {
            console.error('[Wallet Fund] Verify error:', {
                message: error.message,
                statusCode: error.statusCode,
                details: error.details,
            });
            return res.status(502).json({
                status: 'error',
                message: error.publicMessage,
            });
        }

        console.error('[Wallet Fund] Verify error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Could not verify payment',
        });
    }
};

/**
 * Credits the user's wallet atomically using findOneAndUpdate for idempotency.
 */
export const creditWallet = async (transaction, paystackData) => {
    if (transaction.status === 'success') {
        return;
    }

    const txn = await Transaction.findOneAndUpdate(
        { _id: transaction._id, status: 'pending' },
        {
            status: 'success',
            providerTransactionId: String(paystackData.id),
            gatewayResponse: paystackData.gateway_response,
            verifiedAt: new Date(),
            creditedAt: new Date(),
            metadata: {
                ...transaction.metadata,
                paystackChannel: paystackData.channel,
                paystackPaidAt: paystackData.paid_at,
            },
        },
        { new: true }
    );

    if (!txn) {
        return;
    }

    await User.updateOne(
        { _id: txn.user },
        { $inc: { wallet: txn.amount } }
    );

    console.log(`[Wallet Fund] ✓ Credited ₦${txn.amount} to user ${txn.user} (ref: ${txn.reference})`);
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
                availableBalance: user.wallet - totalEscrow
            }
        });
    } catch (error) {
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
            .select('amount type description status reference paymentPurpose createdAt metadata');

        return res.json({
            status: 'success',
            results: transactions.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            transactions
        });
    } catch (error) {
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
 * Returns Master Wallet Address and User's Memo ID for the QR Code screen
 */
export const getStellarDepositInfo = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        // Generate Memo ID on the fly if they don't have one yet
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
                exchangeRate: 1500 // NGN per XLM (Match this with your listener)
            }
        });
    } catch (error) {
        console.error('Get deposit info error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch deposit details' });
    }
};

/**
 * POST /api/wallet/withdraw
 * Creates a withdrawal request (Crypto or Bank) and deducts funds from the wallet
 */
/**
 * POST /api/wallet/withdraw
 * Creates a withdrawal request (Crypto or Bank) and deducts funds from the TASKER's wallet
 */
export const requestWithdrawal = async (req, res) => {
    try {
        const { amount, payoutMethod, stellarAddress, bankDetails, transactionPin } = req.body;
        // Depending on your auth middleware, the ID might be on req.tasker._id or req.user._id.
        // Assuming your middleware decodes the JWT to req.user regardless of account type:
        const taskerId = req.user._id; 

        // 1. CORRECTION: Fetch from Tasker model, not User model
        const tasker = await Tasker.findById(taskerId);

        if (!tasker) return res.status(404).json({ status: 'error', message: 'Tasker not found' });

        // 2. Basic Validation
        const withdrawAmount = Number(amount);
        if (isNaN(withdrawAmount) || withdrawAmount < 5000) {
            return res.status(400).json({ status: 'error', message: 'Minimum withdrawal is ₦5,000' });
        }

        // Check the TASKER'S wallet balance
        if (tasker.wallet < withdrawAmount) {
            return res.status(400).json({ status: 'error', message: 'Insufficient wallet balance' });
        }

        // 3. Verify Transaction PIN on the Tasker model
        if (!tasker.transactionPin) {
             return res.status(400).json({ status: 'error', message: 'Please set up a transaction PIN in your settings first' });
        }
        
        const isPinValid = await bcrypt.compare(transactionPin.toString(), tasker.transactionPin);
        if (!isPinValid) {
            return res.status(401).json({ status: 'error', message: 'Invalid Transaction PIN' });
        }

        // 4. Construct the Pending Withdrawal Request
        const newWithdrawal = new Withdrawal({
            tasker: taskerId, // Explicitly linked to the Tasker
            amount: withdrawAmount,
            payoutMethod: payoutMethod, 
            status: 'pending'
        });

        if (payoutMethod === 'stellar_crypto') {
            if (!stellarAddress) {
                return res.status(400).json({ status: 'error', message: 'Stellar wallet address is required' });
            }
            newWithdrawal.stellarDetails = { publicKey: stellarAddress };
        } else if (payoutMethod === 'bank_transfer') {
            if (!bankDetails || !bankDetails.accountNumber) {
                return res.status(400).json({ status: 'error', message: 'Bank details are required for fiat withdrawal' });
            }
            newWithdrawal.bankDetails = bankDetails;
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid payout method' });
        }

        await newWithdrawal.save();

        // 5. CORRECTION: Deduct the requested amount from the TASKER's wallet to lock it in
        tasker.wallet -= withdrawAmount;
        await tasker.save();

        return res.status(201).json({
            status: 'success',
            message: 'Withdrawal request submitted successfully. Awaiting admin approval.',
            data: { withdrawalId: newWithdrawal._id }
        });

    } catch (error) {
        console.error('Withdrawal request error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to submit withdrawal request' });
    }
};

export const setupTransactionPin = async (req, res) => {
    try {
        const { pin, password } = req.body; // Require their login password for security
        const taskerId = req.user._id;

        // 1. Validate the PIN is exactly 4 digits
        if (!pin || !/^\d{4}$/.test(pin)) {
            return res.status(400).json({ status: 'error', message: 'PIN must be exactly 4 digits' });
        }

        const tasker = await Tasker.findById(taskerId);
        if (!tasker) return res.status(404).json({ status: 'error', message: 'Tasker not found' });

        // 2. Security Check: Verify their actual account password before allowing a PIN change
        const isPasswordValid = await bcrypt.compare(password, tasker.password);
        if (!isPasswordValid) {
            return res.status(401).json({ status: 'error', message: 'Incorrect account password' });
        }

        // 3. Hash the 4-digit PIN and save it
        const salt = await bcrypt.genSalt(10);
        tasker.transactionPin = await bcrypt.hash(pin.toString(), salt);
        await tasker.save();

        return res.json({
            status: 'success',
            message: 'Transaction PIN set successfully. You can now withdraw funds.'
        });

    } catch (error) {
        console.error('Setup PIN error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to set PIN' });
    }
};

/**
 * GET /api/wallet/tasker/balance
 * Returns the Tasker's earned wallet balance and pending withdrawals.
 */
export const getTaskerBalance = async (req, res) => {
    try {
        const tasker = await Tasker.findById(req.user._id).select('wallet');
        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        // Calculate how much money they currently have locked in pending withdrawal requests
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
                availableToWithdraw: tasker.wallet // Assuming their wallet balance reflects actual withdrawable cash
            }
        });
    } catch (error) {
        console.error('Get tasker balance error:', error);
        return res.status(500).json({ status: 'error', message: 'Could not fetch balance' });
    }
};

/**
 * GET /api/wallet/tasker/transactions?page=1&limit=10
 * Returns the Tasker's history (Earnings, Payouts, Withdrawals).
 */
export const getTaskerTransactions = async (req, res) => {
    try {
        const taskerId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // CRITICAL: Filter by the 'tasker' field, not 'user'
        const filter = { tasker: taskerId };

        const total = await Transaction.countDocuments(filter);
        const transactions = await Transaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('amount type description status reference paymentPurpose createdAt metadata');

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
        return res.status(500).json({ status: 'error', message: 'Could not fetch transactions' });
    }
};