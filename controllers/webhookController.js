import AdminNotification from '../models/adminNotification.js'; // Adjust path to your model
import { FLW_WEBHOOK_SECRET } from '../config/envConfig.js';

// POST /api/webhooks/resend
export const handleResendWebhook = async (req, res) => {
    try {
        const event = req.body;

        // We only care when an email is opened
        if (event.type === 'email.opened') {
            // FIX: Removed `.email` so it doesn't crash!
            const tags = event.data?.tags || [];
            const notifTag = tags.find(t => t.name === 'notificationId');

            if (notifTag && notifTag.value) {
                // Increment the open count instantly!
                await AdminNotification.findByIdAndUpdate(
                    notifTag.value,
                    { $inc: { openedCount: 1 } }
                );
            }
        }
        
        // Always return 200 OK fast so Resend knows we got it
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

        // OneSignal triggers this when a user taps the push notification
        if (payload.event === 'notification.opened') {
            // Extract the hidden data we attached
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
            const reference = transferData.reference; // The ID you sent initially

            if (transferData.status === 'SUCCESSFUL') {
                console.log(`Transfer ${reference} was approved and paid!`);
                
                // TODO: Find the payout in your database using the reference
                // Update the Tasker's withdrawal record status to "Completed"
                
            } else if (transferData.status === 'FAILED') {
                console.log(`Transfer ${reference} failed or was rejected.`);
                
                // TODO: Update the database status to "Failed"
                // Refund the money back to the Tasker's TaskHub wallet
            }
        }

        // 3. Always return a fast 200 OK so Flutterwave doesn't keep retrying
        return res.status(200).send('OK');

    } catch (error) {
        console.error('Flutterwave Webhook Error:', error);
        return res.status(500).send('Webhook Error');
    }
};