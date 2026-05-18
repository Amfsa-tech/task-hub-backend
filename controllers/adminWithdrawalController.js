import crypto from 'crypto';
import Withdrawal from '../models/withdrawal.js';
import Tasker from '../models/tasker.js';
import Task from '../models/task.js';
import Transaction from '../models/transaction.js';
import Notification from '../models/notification.js';
import ActivityLog from '../models/ActivityLog.js';
import AdminSettings from '../models/adminSettings.js';
import paystackService from '../services/paystack_service.js';
import flutterwaveService from '../services/flutterwave_service.js';
import { logAdminAction } from '../utils/auditLogger.js';
import { escapeRegex } from '../utils/searchUtils.js';
import { sendEmail, payoutSuccessEmailHtml } from '../services/emailService.js';
import { baseLayout } from '../utils/taskerEmailTemplates.js';
import { 
    notifyWithdrawalRequested, 
    notifyWithdrawalRejected, 
    notifyWithdrawalCompleted 
} from '../utils/notificationUtils.js';
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
        // 1. Fetch the Withdrawal and populate Tasker/Admin info
        const withdrawal = await Withdrawal.findById(req.params.id)
            .populate('tasker', 'firstName lastName emailAddress profilePicture wallet')
            .populate('reviewedBy', 'name');

        if (!withdrawal) {
            return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });
        }

        const tasker = withdrawal.tasker;

        // 2. Calculate Current Escrow (Sum of budgets for active tasks)
        const escrowAgg = await Task.aggregate([
            { $match: { assignedTasker: tasker._id, status: { $in: ['assigned', 'in-progress'] } } },
            { $group: { _id: null, totalEscrow: { $sum: '$budget' } } }
        ]);
        const currentEscrowBalance = escrowAgg[0]?.totalEscrow || 0;

        // 3. Fetch Proof of Earnings (Recent tasks this tasker completed)
        const recentTasks = await Task.find({ 
            assignedTasker: tasker._id, 
            status: 'completed' 
        })
        .select('title budget taskerPayout balanceAfter completedAt updatedAt')
        .sort({ completedAt: -1, updatedAt: -1 }) // Get the newest completed tasks first
        .limit(15); 

        // 4. Structure the response for the frontend
        return res.json({ 
            status: 'success', 
            data: {
                // Core Withdrawal & Bank Details
                withdrawalInfo: {
                    id: withdrawal._id,
                    amount: withdrawal.amount,
                    status: withdrawal.status,
                    payoutMethod: withdrawal.payoutMethod,
                    bankDetails: withdrawal.bankDetails,       // 💳 Exposed for the admin
                    stellarDetails: withdrawal.stellarDetails, 
                    requestedAt: withdrawal.createdAt,
                    blockchainTxId: withdrawal.blockchainTxId,
                    rejectionReason: withdrawal.rejectionReason,
                    reviewedBy: withdrawal.reviewedBy
                },

                // Live Wallet & Escrow Balances
                taskerFinancials: {
                    taskerId: tasker._id,
                    name: `${tasker.firstName} ${tasker.lastName}`,
                    email: tasker.emailAddress,
                    currentWalletBalance: tasker.wallet || 0,
                    currentEscrowBalance: currentEscrowBalance
                },

                // The Audit Trail (Tasks & Balance Snapshots)
                auditTrail: {
                    tasksCompleted: recentTasks.map(task => ({
                        taskId: task._id,
                        title: task.title,
                        taskBudget: task.budget,             // What the user paid
                        amountEarned: task.taskerPayout,     // What the tasker actually earned (minus platform fees)
                        balanceAfterTask: task.balanceAfter, // 💰 The exact wallet balance after this specific task
                        completedAt: task.completedAt || task.updatedAt
                    }))
                }
            } 
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('[Admin] Error fetching withdrawal details:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch withdrawal audit data' });
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

                withdrawal.status = 'completed';
                withdrawal.blockchainTxId = response.hash;
                withdrawal.reviewedBy = req.admin._id;
                withdrawal.reviewedAt = new Date();
                withdrawal.completedAt = new Date();
                await withdrawal.save();

                // 🔐 SNAPSHOT: Fetch tasker to record accurate snapshot at this exact moment
                const taskerModel = await Tasker.findById(tasker._id);
                const currentTaskerBal = taskerModel.wallet || 0;

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
                    balanceBefore: currentTaskerBal, // 🔐
                    balanceAfter: currentTaskerBal,  // 🔐
                    metadata: { txHash: response.hash }
                });

                const explorerLink = `https://stellar.expert/explorer/testnet/tx/${response.hash}`;
                await Notification.create({
                    tasker: tasker._id,
                    title: 'Payout Successful!',
                    message: `Your withdrawal of ₦${withdrawal.amount} (${xlmAmount} XLM) has been sent to your wallet.`,
                    type: 'payout',
                    metadata: { 
                        blockchainTxId: response.hash,
                        externalLink: explorerLink 
                    }
                });

                try {
                    const { sendWebPushToAccount } = await import('../services/webPushService.js');
                    const taskerWithPush = await Tasker.findById(tasker._id).select('pushSubscriptions');
                    if (taskerWithPush && taskerWithPush.pushSubscriptions && taskerWithPush.pushSubscriptions.length > 0) {
                        await sendWebPushToAccount(taskerWithPush, 'Payout Successful! 🚀', `Your withdrawal of ₦${withdrawal.amount} (${xlmAmount} XLM) has been sent to your wallet.`, { type: 'payout', action: 'view_wallet' });
                    }
                } catch (webPushErr) {
                    console.error('Web push notification error (crypto payout):', webPushErr.message);
                }

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
        // FLOW B: AUTOMATED BANK TRANSFER (VIA FLUTTERWAVE)
        // ==========================================
        else {
            try {
                // 1. Grab the bank details the user saved
                const { accountNumber, bankCode, bankName } = withdrawal.bankDetails;
                const reference = `PAYOUT-${withdrawal._id}-${Date.now()}`;
                console.log(`🚨 Payout Debug - Withdrawal ID: ${withdrawal._id} | Amount: ₦${withdrawal.amount} | Bank: ${bankName}`);
                
                // 2. Command Flutterwave to send the real money to the bank!
                const payoutResponse = await flutterwaveService.initiatePayout({
                    accountNumber: accountNumber,
                    bankCode: bankCode,
                    amount: withdrawal.amount,
                    reference: reference,
                    narration: `TaskHub Payout - ${tasker.firstName}`
                });

                // 3. 🚨 FIX: FLW accepted the request, but the bank is still processing it.
                withdrawal.status = 'processing';
                withdrawal.reviewedBy = req.admin._id;
                withdrawal.reviewedAt = new Date();
                // 🛑 We DO NOT set completedAt here anymore!
                withdrawal.blockchainTxId = String(payoutResponse.transfer_code); // Saving FLW tracking ID
                await withdrawal.save();

                // 4. 🔐 SNAPSHOT: Create the official ledger transaction (Debit)
                const taskerModel = await Tasker.findById(tasker._id);
                const currentTaskerBal = taskerModel.wallet || 0;

                await Transaction.create({
                    tasker: tasker._id,
                    amount: withdrawal.amount,
                    type: 'debit',
                    description: `Automated Bank Withdrawal to ${bankName} (Processing)`,
                    status: 'success', 
                    reference: reference,
                    provider: 'flutterwave',
                    paymentPurpose: 'withdrawal',
                    currency: 'NGN',
                    balanceBefore: currentTaskerBal,
                    balanceAfter: currentTaskerBal,
                    metadata: { flwTransferCode: payoutResponse.transfer_code }
                });

                // 5. Send Notifications
                await Notification.create({
                    tasker: tasker._id,
                    title: 'Withdrawal Processing ⏳',
                    message: `Your bank withdrawal of ₦${withdrawal.amount} is currently being processed by the bank.`,
                    type: 'payout'
                });

                try {
                    const { sendWebPushToAccount } = await import('../services/webPushService.js');
                    const taskerWithPush = await Tasker.findById(tasker._id).select('pushSubscriptions');
                    if (taskerWithPush && taskerWithPush.pushSubscriptions && taskerWithPush.pushSubscriptions.length > 0) {
                        await sendWebPushToAccount(taskerWithPush, 'Withdrawal Processing ⏳', `Your bank withdrawal of ₦${withdrawal.amount} is currently being processed.`, { type: 'payout', action: 'view_wallet' });
                    }
                } catch (webPushErr) {
                    console.error('Web push notification error (bank approval):', webPushErr.message);
                }

                const bankHtml = baseLayout('Withdrawal Processing', `<p>Hi ${tasker.firstName}, your bank withdrawal of <b>₦${withdrawal.amount}</b> has been initiated and is currently processing. It will arrive in your bank account shortly.</p>`);
                await sendEmail({
                    to: tasker.emailAddress,
                    subject: 'TaskHub: Withdrawal Processing ⏳',
                    html: bankHtml
                });

                await logAdminAction({
                    adminId: req.admin._id,
                    action: 'APPROVE_BANK_WITHDRAWAL_PROCESSING',
                    resourceType: 'Withdrawal',
                    resourceId: withdrawal._id,
                    req
                });

                return res.json({ status: 'success', message: 'Payout initiated! Waiting for bank confirmation.' });

            } catch (payoutError) {
                console.error("Flutterwave Payout Failed:", payoutError);
                return res.status(500).json({ 
                    status: 'error', 
                    message: payoutError.publicMessage || 'Gateway failed to send funds. Please check your Flutterwave dashboard balance.' 
                });
            }
        }
    } catch (error) {
        // Sentry.captureException(error); // Uncomment if Sentry is imported
        return res.status(500).json({ status: 'error', message: 'Failed to approve withdrawal' });
    }
};

export const rejectWithdrawal = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ status: 'error', message: 'Rejection reason is required' });

        const withdrawal = await Withdrawal.findById(req.params.id);
        if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Withdrawal not found' });

        // 🛑 SECURITY FIX: Only allow rejecting requests that are strictly 'pending'
        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ 
                status: 'error', 
                message: `Too late to reject! This withdrawal is already ${withdrawal.status} and funds are moving.` 
            });
        }

        // 🔐 SNAPSHOT: Refund Wallet safely
        const taskerToRefund = await Tasker.findById(withdrawal.tasker);
        const prevBal = taskerToRefund.wallet || 0;
        const newBal = prevBal + Math.abs(withdrawal.amount);
        taskerToRefund.wallet = newBal;
        await taskerToRefund.save();

        withdrawal.status = 'rejected';
        withdrawal.rejectionReason = reason;
        withdrawal.reviewedBy = req.admin._id;
        withdrawal.reviewedAt = new Date();
        withdrawal.balanceBefore = prevBal;
        withdrawal.balanceAfter = newBal;
        await withdrawal.save();

        try {
            await notifyWithdrawalRejected(withdrawal.tasker.toString(), withdrawal.amount, reason);
        } catch (notifyErr) {
            console.error('Failed to send withdrawal rejection notification:', notifyErr);
        }

        await logAdminAction({
            adminId: req.admin._id,
            action: 'REJECT_WITHDRAWAL',
            resourceType: 'Withdrawal',
            resourceId: withdrawal._id,
            req,
            details: { reason }
        });

        return res.json({ status: 'success', message: 'Withdrawal rejected and funds returned' });
    } catch (error) {
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Failed to reject withdrawal' });
    }
};

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

        // 🛑 LEDGER TRANSACTION CREATION REMOVED HERE 
        // The automated approveWithdrawal function handles the ledger now.
        // This ensures no double-deductions occur on the platform's financial records.

        try {
            await notifyWithdrawalCompleted(
                withdrawal.tasker.toString(),
                withdrawal.amount,
                withdrawal.bankDetails?.bankName || 'bank'
            );
        } catch (notifyErr) {
            console.error('Failed to send withdrawal completion notification:', notifyErr);
        }

        await logAdminAction({
            adminId: req.admin._id,
            action: 'COMPLETE_BANK_WITHDRAWAL_MANUAL_OVERRIDE',
            resourceType: 'Withdrawal',
            resourceId: withdrawal._id,
            req
        });

        return res.json({ status: 'success', message: 'Bank Withdrawal marked as completed (Manual Override)' });
    } catch (error) {
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Failed to complete withdrawal' });
    }
};