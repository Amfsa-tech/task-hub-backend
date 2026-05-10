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
        // 1. Security Check: Verify this actually came from Flutterwave
        const signature = req.headers['verif-hash'];
        if (!signature || signature !== FLW_WEBHOOK_SECRET) {
            console.warn('Unauthorized webhook attempt');
            return res.status(401).send('Unauthorized');
        }

        const event = req.body;

        // 2. Listen specifically for Transfer (Payout) updates
        if (event.event === 'transfer.completed') {
            const transferData = event.data;
            const reference = transferData.reference; // e.g., PAYOUT-69ffa75d3c791ed0c308c3d1-17153...
            const flwTransferId = transferData.id;
            
            // Extract the MongoDB Withdrawal ID from our custom reference string
            const parts = reference ? reference.split('-') : [];
            const withdrawalId = parts.length >= 2 ? parts[1] : null;

            // Find the withdrawal in the database
            let withdrawal;
            if (withdrawalId) {
                withdrawal = await Withdrawal.findById(withdrawalId);
            }
            if (!withdrawal) {
                // Fallback: Try to find it by the tracking ID we saved when approving
                withdrawal = await Withdrawal.findOne({ blockchainTxId: String(flwTransferId) });
            }

            if (withdrawal) {
                if (transferData.status === 'SUCCESSFUL') {
                    console.log(`Transfer ${reference} was successfully paid!`);
                    if (withdrawal.status !== 'completed') {
                        withdrawal.status = 'completed';
                        withdrawal.completedAt = new Date();
                        await withdrawal.save();
                    }
                } 
                else if (transferData.status === 'FAILED') {
                    console.log(`Transfer ${reference} failed or was rejected by the bank.`);
                    
                    // Only process refund if we haven't already marked it as failed/rejected
                    if (withdrawal.status !== 'failed' && withdrawal.status !== 'rejected') {
                        // Mark as failed
                        withdrawal.status = 'failed';
                        withdrawal.rejectionReason = transferData.complete_message || 'Rejected by receiving bank';
                        await withdrawal.save();

                        // Securely refund the Tasker's wallet
                        const tasker = await Tasker.findById(withdrawal.tasker);
                        if (tasker) {
                            const prevBal = tasker.wallet || 0;
                            const newBal = prevBal + withdrawal.amount;
                            tasker.wallet = newBal;
                            await tasker.save();

                            // Log the refund transaction so financial records are accurate
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
                        }
                    }
                }
            }
        }

        // 3. Always return a fast 200 OK so Flutterwave doesn't keep retrying
        return res.status(200).send('OK');

    } catch (error) {
        console.error('Flutterwave Webhook Error:', error);
        return res.status(500).send('Webhook Error');
    }
};