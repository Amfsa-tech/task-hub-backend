import AdminNotification from '../models/adminNotification.js'; // Adjust path to your model

// POST /api/webhooks/resend
export const handleResendWebhook = async (req, res) => {
    try {
        const event = req.body;

        // We only care when an email is opened
        if (event.type === 'email.opened') {
            // Extract our hidden tag
            const tags = event.data.email.tags || [];
            const notifTag = tags.find(t => t.name === 'notificationId');

            if (notifTag) {
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