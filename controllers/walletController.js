import crypto from 'crypto';
import Transaction from '../models/transaction.js';
import User from '../models/user.js';
import paystackService from '../services/paystack_service.js';

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
        if (!nairaAmount || nairaAmount < 100) {
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
 * If the webhook already credited the wallet, returns the final state.
 * If not yet processed, verifies with Paystack and credits if successful.
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
 * If the transaction is already 'success', it returns immediately.
 */
export const creditWallet = async (transaction, paystackData) => {
    // Idempotency: skip if already credited
    if (transaction.status === 'success') {
        return;
    }

    // Atomically mark the transaction as success only if still pending
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
        // Already processed by another path (webhook vs verify race)
        return;
    }

    // Credit the user's wallet
    await User.updateOne(
        { _id: txn.user },
        { $inc: { wallet: txn.amount } }
    );

    console.log(`[Wallet Fund] ✓ Credited ₦${txn.amount} to user ${txn.user} (ref: ${txn.reference})`);
};
