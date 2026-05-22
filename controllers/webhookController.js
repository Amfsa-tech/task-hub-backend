import AdminNotification from '../models/adminNotification.js'; 
import Withdrawal from '../models/withdrawal.js';
import Tasker from '../models/tasker.js';
import Transaction from '../models/transaction.js';
import { FLW_WEBHOOK_SECRET } from '../config/envConfig.js';

// POST /api/webhooks/resend
export const handleResendWebhook = async (req, res) => {
    try {
        const event = req.body;
        
        // 1. Acknowledge receipt immediately so Resend knows we got it and doesn't retry
        res.status(200).send('OK');

        if (event.type === 'email.opened') {
            console.log('\n--- RESEND OPEN WEBHOOK TRIGGERED ---');
            
            // The || [] ensures that if Resend sends an email without tags, it doesn't crash!
            const tags = event.data?.tags || [];
            console.log('Tags received from Resend:', tags);

            // 2. We FORCE lowercase here because Resend sometimes alters the capitalization of tag names
            const notifTag = tags.find(t => t.name.toLowerCase() === 'notificationid');

            if (notifTag && notifTag.value) {
                const cleanId = notifTag.value.trim();
                console.log(`Attempting to update AdminNotification ID: ${cleanId}`);

                // 3. Perform the update
                const updatedDoc = await AdminNotification.findByIdAndUpdate(
                    cleanId,
                    { $inc: { openedCount: 1 } },
                    { new: true }
                );

                if (updatedDoc) {
                    console.log(`Success! New Open Count: ${updatedDoc.openedCount}`);
                } else {
                    console.log(`ERROR: Could not find AdminNotification with ID ${cleanId} in the database.`);
                }
            } else {
                console.log('WARNING: No "notificationId" tag found in this open event. (This is normal for test emails sent without a database ID).');
            }
            console.log('----------------------------------------\n');
        }
    } catch (error) {
        // Since we already sent the 200 OK at the top, this just logs the error safely
        console.error('🔥 Resend Webhook Processing Error:', error);
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

        // ==========================================
        // FLOW 1: WITHDRAWALS (Money leaving TaskHub)
        // ==========================================
        if (event.event === 'transfer.completed') {
            const transferData = event.data;
            const reference = transferData.reference; 
            const flwTransferId = transferData.id;
            
            console.log(`💸 Processing Transfer Update for Ref: ${reference} | Status: ${transferData.status}`);

            const parts = reference ? reference.split('-') : [];
            const withdrawalId = parts.length >= 2 ? parts[1] : null;

            let withdrawal;
            if (withdrawalId) {
                withdrawal = await Withdrawal.findById(withdrawalId);
            }
            if (!withdrawal) {
                withdrawal = await Withdrawal.findOne({ blockchainTxId: String(flwTransferId) });
            }

            if (!withdrawal) {
                console.error(`❌ Webhook Error: Could not find withdrawal in DB for Ref: ${reference}`);
                return res.status(200).send('OK'); 
            }

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

                    const tasker = await Tasker.findById(withdrawal.tasker);
                    if (tasker) {
                        const prevBal = Number(tasker.wallet) || 0;
                        const newBal = prevBal + Number(withdrawal.amount);
                        tasker.wallet = newBal;
                        await tasker.save();

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

        // ==========================================
        // FLOW 2: WALLET FUNDING (Money entering TaskHub)
        // ==========================================
        else if (event.event === 'charge.completed') {
            const chargeData = event.data;
            // 🚨 Flutterwave uses tx_ref for charges, NOT reference!
            const reference = chargeData.tx_ref; 
            
            console.log(`💰 Processing Wallet Funding for Ref: ${reference} | Status: ${chargeData.status}`);

            // Find the pending transaction
            const transaction = await Transaction.findOne({ reference, status: 'pending' });

            if (transaction && chargeData.status === 'successful') {
                // Figure out if it's a User or Tasker dynamically
                let account = await User.findById(transaction.user);
                let accountType = 'User';

                if (!account) {
                    account = await Tasker.findById(transaction.user);
                    accountType = 'Tasker';
                }

                if (account) {
                    // Strict Math
                    const previousBalance = Number(account.wallet) || 0;
                    const depositAmount = Number(transaction.amount) || 0;
                    const newBalance = previousBalance + depositAmount;

                    // Add money to the correct wallet
                    account.wallet = newBalance;
                    await account.save();

                    // Update the transaction ledger
                    transaction.status = 'success';
                    transaction.providerTransactionId = String(chargeData.id);
                    transaction.verifiedAt = new Date();
                    transaction.creditedAt = new Date();
                    transaction.previousBalance = previousBalance;
                    transaction.balanceAfter = newBalance;
                    transaction.metadata = {
                        ...transaction.metadata,
                        accountRole: accountType,
                        webhookConfirmed: true
                    };
                    await transaction.save();

                    console.log(`✅ Webhook successfully funded ₦${depositAmount} to ${accountType} ${account._id}`);
                } else {
                    console.error(`❌ Webhook Error: Account not found for funding Ref: ${reference}`);
                }
            }
        }

        // Always return 200 immediately so Flutterwave knows we got the message
        return res.status(200).send('OK');

    } catch (error) {
        console.error('🔥 Flutterwave Webhook Error:', error);
        return res.status(500).send('Webhook Error');
    }
};