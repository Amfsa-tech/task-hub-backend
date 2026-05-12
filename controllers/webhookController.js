import AdminNotification from '../models/adminNotification.js'; 
import Withdrawal from '../models/withdrawal.js';
import Tasker from '../models/tasker.js';
import Transaction from '../models/transaction.js';
import { FLW_WEBHOOK_SECRET } from '../config/envConfig.js';

// POST /api/webhooks/resend
export const handleResendWebhook = async (req, res) => {
    try {
        const event = req.body;
        if (event.type === 'email.opened') {
            const tags = event.data?.tags || [];
            const notifTag = tags.find(t => t.name === 'notificationId');

            if (notifTag && notifTag.value) {
                await AdminNotification.findByIdAndUpdate(
                    notifTag.value,
                    { $inc: { openedCount: 1 } }
                );
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('Resend Webhook Error:', error);
        res.status(500).send('Webhook Error');
    }
};

// POST /api/webhooks/onesignal
export const handleOneSignalWebhook = async (req, res) => {
    try {
        const payload = req.body;
        if (payload.event === 'notification.opened') {
            const customData = payload.data?.custom?.a || payload.data?.additionalData || {};
            const notificationId = customData.notificationId;

            if (notificationId) {
                await AdminNotification.findByIdAndUpdate(
                    notificationId,
                    { $inc: { openedCount: 1 } }
                );
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('OneSignal Webhook Error:', error);
        res.status(500).send('Webhook Error');
    }
};

// POST /api/webhooks/flutterwave
export const handleFlutterwaveWebhook = async (req, res) => {
    try {
        // 1. Security Check
        const signature = req.headers['verif-hash'];
        if (!signature || signature !== FLW_WEBHOOK_SECRET) {
            console.warn('🚨 Unauthorized Flutterwave webhook attempt!');
            return res.status(401).send('Unauthorized');
        }

        const event = req.body;
        console.log(`🔔 FLW Webhook Received: Event Type -> ${event.event}`);

        // 2. We ONLY care about transfer completions
        if (event.event === 'transfer.completed') {
            const transferData = event.data;
            const reference = transferData.reference; 
            const flwTransferId = transferData.id;
            
            console.log(`💸 Processing Transfer Update for Ref: ${reference} | Status: ${transferData.status}`);

            // Extract the Withdrawal ID from the reference (e.g., PAYOUT-6a00...-1715)
            const parts = reference ? reference.split('-') : [];
            const withdrawalId = parts.length >= 2 ? parts[1] : null;

            // Find the withdrawal in the database
            let withdrawal;
            if (withdrawalId) {
                withdrawal = await Withdrawal.findById(withdrawalId);
            }
            if (!withdrawal) {
                // Fallback: Search by the transfer_code we saved when approving
                withdrawal = await Withdrawal.findOne({ blockchainTxId: String(flwTransferId) });
            }

            if (!withdrawal) {
                console.error(`❌ Webhook Error: Could not find withdrawal in DB for Ref: ${reference}`);
                return res.status(200).send('OK'); // Still return 200 so FLW stops pinging
            }

            // 3. Update Status based on Bank's final verdict
            if (transferData.status === 'SUCCESSFUL') {
                if (withdrawal.status !== 'completed') {
                    withdrawal.status = 'completed';
                    withdrawal.completedAt = new Date();
                    await withdrawal.save();
                    console.log(`✅ Withdrawal ${withdrawal._id} successfully marked as COMPLETED.`);
                }
            } 
            else if (transferData.status === 'FAILED') {
                if (withdrawal.status !== 'failed' && withdrawal.status !== 'rejected') {
                    withdrawal.status = 'failed';
                    withdrawal.rejectionReason = transferData.complete_message || 'Rejected by receiving bank';
                    await withdrawal.save();
                    console.log(`❌ Withdrawal ${withdrawal._id} marked as FAILED. Reason: ${withdrawal.rejectionReason}`);

                    // Refund the Tasker's wallet
                    const tasker = await Tasker.findById(withdrawal.tasker);
                    if (tasker) {
                        const prevBal = tasker.wallet || 0;
                        const newBal = prevBal + withdrawal.amount;
                        tasker.wallet = newBal;
                        await tasker.save();

                        // Log the refund transaction
                        await Transaction.create({
                            tasker: tasker._id,
                            amount: withdrawal.amount,
                            type: 'credit',
                            description: `Refund: Failed Bank Withdrawal (${transferData.complete_message || 'Reversed'})`,
                            status: 'success',
                            reference: `REF-${withdrawal._id}-${Date.now()}`,
                            provider: 'system',
                            paymentPurpose: 'refund',
                            currency: 'NGN',
                            balanceBefore: prevBal,
                            balanceAfter: newBal,
                            metadata: { originalReference: reference }
                        });
                        console.log(`💰 Refunded ₦${withdrawal.amount} to Tasker ${tasker._id}`);
                    }
                }
            }
        }

        // Always return 200 immediately
        return res.status(200).send('OK');

    } catch (error) {
        console.error('🔥 Flutterwave Webhook Error:', error);
        return res.status(500).send('Webhook Error');
    }
};