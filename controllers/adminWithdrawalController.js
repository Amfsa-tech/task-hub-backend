import Withdrawal from '../models/withdrawal.js';
import Tasker from '../models/tasker.js';
import Transaction from '../models/transaction.js';
import Notification from '../models/notification.js'; // Added for in-app alerts
import ActivityLog from '../models/ActivityLog.js'; // Added for audit trail
import { logAdminAction } from '../utils/auditLogger.js';
import { escapeRegex } from '../utils/searchUtils.js';
import { sendEmail, payoutSuccessEmailHtml } from '../services/emailService.js';
import { baseLayout } from '../utils/taskerEmailTemplates.js';
import * as Sentry from '@sentry/node';
import * as StellarSdk from 'stellar-sdk';

// Setup Stellar Server for payouts
const IS_TESTNET = process.env.STELLAR_NETWORK === 'TESTNET';
const stellarServer = new StellarSdk.Horizon.Server(
    IS_TESTNET ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'
);
const XLM_TO_NGN_RATE = 1500; 

/**
 * GET /api/admin/withdrawals/stats
 */
export const getWithdrawalStats = async (req, res) => {
    try {
        const [
            totalRequests,
            pendingCount,
            approvedCount,
            completedCount,
            rejectedCount,
            processingCount 
        ] = await Promise.all([
            Withdrawal.countDocuments(),
            Withdrawal.countDocuments({ status: 'pending' }),
            Withdrawal.countDocuments({ status: 'approved' }),
            Withdrawal.countDocuments({ status: 'completed' }),
            Withdrawal.countDocuments({ status: 'rejected' }),
            Withdrawal.countDocuments({ status: 'processing' })
        ]);

        const totalPaidAgg = await Withdrawal.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalPaid = totalPaidAgg[0]?.total || 0;

        const pendingAmountAgg = await Withdrawal.aggregate([
            { $match: { status: { $in: ['pending', 'approved', 'processing'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const pendingAmount = pendingAmountAgg[0]?.total || 0;

        return res.json({
            status: 'success',
            data: {
                totalRequests,
                pending: pendingCount,
                processing: processingCount,
                approved: approvedCount,
                completed: completedCount,
                rejected: rejectedCount,
                totalPaid,
                pendingAmount
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Withdrawal stats error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch withdrawal stats' });
    }
};

/**
 * GET /api/admin/withdrawals
 */
export const getAllWithdrawals = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;
        const query = {};

        if (status) query.status = status;

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            const escaped = escapeRegex(search);
            const matchingTaskers = await Tasker.find({
                $or: [
                    { firstName: { $regex: escaped, $options: 'i' } },
                    { lastName: { $regex: escaped, $options: 'i' } },
                    { emailAddress: { $regex: escaped, $options: 'i' } }
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
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch withdrawals' });
    }
};

/**
 * GET /api/admin/withdrawals/:id
 */
export const getWithdrawalById = async (req, res) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id)
            .populate('tasker', 'firstName lastName emailAddress profilePicture wallet bankAccount')
            .populate('reviewedBy', 'name');

        if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });

        return res.json({ status: 'success', data: withdrawal });
    } catch (error) {
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch withdrawal' });
    }
};

/**
 * PATCH /api/admin/withdrawals/:id/approve
 */
export const approveWithdrawal = async (req, res) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id).populate('tasker');
        if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });
        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ status: 'error', message: `Cannot approve with status '${withdrawal.status}'` });
        }

        const tasker = withdrawal.tasker;

        // ==========================================
        // FLOW A: STELLAR CRYPTO AUTOMATED PAYOUT
        // ==========================================
        if (withdrawal.payoutMethod === 'stellar_crypto') {
            withdrawal.status = 'processing';
            await withdrawal.save();

            try {
                const masterKeypair = StellarSdk.Keypair.fromSecret(process.env.STELLAR_MASTER_SECRET_KEY);
                const sourceAccount = await stellarServer.loadAccount(masterKeypair.publicKey());
                const xlmAmount = (withdrawal.amount / XLM_TO_NGN_RATE).toFixed(7);

                const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
                    fee: await stellarServer.fetchBaseFee(),
                    networkPassphrase: IS_TESTNET ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC
                })
                .addOperation(StellarSdk.Operation.payment({
                    destination: withdrawal.stellarDetails.publicKey,
                    asset: StellarSdk.Asset.native(),
                    amount: xlmAmount.toString()
                }))
                .setTimeout(30)
                .build();

                transaction.sign(masterKeypair);
                const response = await stellarServer.submitTransaction(transaction);

                // Update withdrawal status
                withdrawal.status = 'completed';
                withdrawal.blockchainTxId = response.hash;
                withdrawal.reviewedBy = req.admin._id;
                withdrawal.reviewedAt = new Date();
                withdrawal.completedAt = new Date();
                await withdrawal.save();

                // Create Transaction record
                await Transaction.create({
                    tasker: tasker._id,
                    amount: withdrawal.amount,
                    type: 'debit',
                    description: `Stellar Crypto Withdrawal [Hash: ${response.hash.substring(0, 8)}...]`,
                    status: 'success',
                    reference: `WD-${withdrawal._id}`,
                    provider: 'stellar',
                    paymentPurpose: 'withdrawal',
                    currency: 'NGN',
                    metadata: { txHash: response.hash }
                });

                // 1. Send In-App Notification (Grant Transparency)
                const explorerLink = `https://stellar.expert/explorer/testnet/tx/${response.hash}`;
                await Notification.create({
                    tasker: tasker._id,
                    title: 'Payout Successful! 🚀',
                    message: `Your withdrawal of ₦${withdrawal.amount} (${xlmAmount} XLM) has been sent to your wallet.`,
                    type: 'payout',
                    metadata: { 
                        blockchainTxId: response.hash,
                        externalLink: explorerLink 
                    }
                });

                // 2. Send Automated Email Receipt (Brand purple layout)
                const receiptHtml = baseLayout('Payout Successful 💰', payoutSuccessEmailHtml({
                    taskerName: tasker.firstName,
                    amount: withdrawal.amount,
                    method: 'Stellar (XLM)',
                    txHash: response.hash
                }));
                await sendEmail({
                    to: tasker.emailAddress,
                    subject: 'TaskHub: Payout Successful 💰',
                    html: receiptHtml
                });

                // 3. Log User Activity (Auditing)
                await ActivityLog.create({
                    userId: tasker._id,
                    userModel: 'Tasker',
                    action: 'WITHDRAWAL_COMPLETED_STELLAR',
                    metadata: { amount: withdrawal.amount, txHash: response.hash }
                });

                await logAdminAction({
                    adminId: req.admin._id,
                    action: 'APPROVE_AND_EXECUTE_CRYPTO_WITHDRAWAL',
                    resourceType: 'Withdrawal',
                    resourceId: withdrawal._id,
                    req
                });

                return res.json({ status: 'success', message: 'Payout sent and Tasker notified!', data: { txHash: response.hash } });

            } catch (blockchainError) {
                console.error("Stellar Payout Failed:", blockchainError);
                withdrawal.status = 'pending';
                await withdrawal.save();
                return res.status(500).json({ status: 'error', message: 'Blockchain payment failed.' });
            }
        } 
        
        // ==========================================
        // FLOW B: MANUAL BANK TRANSFER
        // ==========================================
        else {
            withdrawal.status = 'approved';
            withdrawal.reviewedBy = req.admin._id;
            withdrawal.reviewedAt = new Date();
            await withdrawal.save();

            // Notify In-App
            await Notification.create({
                tasker: tasker._id,
                title: 'Withdrawal Approved 🏦',
                message: `Your bank withdrawal of ₦${withdrawal.amount} is being processed.`,
                type: 'payout'
            });

            // Notify via Email
            const bankHtml = baseLayout('Withdrawal Approved', `<p>Hi ${tasker.firstName}, your bank withdrawal of <b>₦${withdrawal.amount}</b> has been approved and is being processed.</p>`);
            await sendEmail({
                to: tasker.emailAddress,
                subject: 'TaskHub: Withdrawal Approved 🏦',
                html: bankHtml
            });

            await logAdminAction({
                adminId: req.admin._id,
                action: 'APPROVE_BANK_WITHDRAWAL',
                resourceType: 'Withdrawal',
                resourceId: withdrawal._id,
                req
            });

            return res.json({ status: 'success', message: 'Bank withdrawal approved.' });
        Sentry.captureException(error);
        }
    } catch (error) {
        return res.status(500).json({ status: 'error', message: 'Failed to approve withdrawal' });
    }
};

/**
 * PATCH /api/admin/withdrawals/:id/reject
 */
export const rejectWithdrawal = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ status: 'error', message: 'Rejection reason is required' });

        const withdrawal = await Withdrawal.findById(req.params.id);
        if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });

        if (!['pending', 'approved', 'processing'].includes(withdrawal.status)) {
            return res.status(400).json({ status: 'error', message: `Cannot reject with status '${withdrawal.status}'` });
        }

        await Tasker.updateOne(
            { _id: withdrawal.tasker },
            { $inc: { wallet: Math.abs(withdrawal.amount) } }
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

        Sentry.captureException(error);
        return res.json({ status: 'success', message: 'Withdrawal rejected and funds returned' });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: 'Failed to reject withdrawal' });
    }
};

/**
 * PATCH /api/admin/withdrawals/:id/complete
 */
export const completeWithdrawal = async (req, res) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id);
        if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });
        
        if (withdrawal.status !== 'approved') {
            return res.status(400).json({ status: 'error', message: `Cannot complete with status '${withdrawal.status}'` });
        }

        if (withdrawal.payoutMethod === 'stellar_crypto') {
            return res.status(400).json({ status: 'error', message: 'Crypto withdrawals auto-complete.' });
        }

        withdrawal.status = 'completed';
        withdrawal.completedAt = new Date();
        await withdrawal.save();

        await Transaction.create({
            tasker: withdrawal.tasker,
            amount: withdrawal.amount,
            type: 'debit',
            description: `Bank Withdrawal to ${withdrawal.bankDetails?.bankName}`,
            status: 'success',
            reference: `WD-${withdrawal._id}`,
            provider: 'system',
            paymentPurpose: 'withdrawal',
            currency: 'NGN',
            metadata: { withdrawalId: withdrawal._id.toString() }
        });

        await logAdminAction({
            adminId: req.admin._id,
            action: 'COMPLETE_BANK_WITHDRAWAL',
            resourceType: 'Withdrawal',
            resourceId: withdrawal._id,
            req
        });

        return res.json({ status: 'success', message: 'Bank Withdrawal marked as completed' });
    } catch (error) {
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Failed to complete withdrawal' });
    }
};