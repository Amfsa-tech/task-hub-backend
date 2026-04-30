import { handleResendWebhook, handleOneSignalWebhook } from '../controllers/webhookController.js';

// IMPORTANT: No auth middleware here!
router.post('/api/webhooks/resend', handleResendWebhook);
router.post('/api/webhooks/onesignal', handleOneSignalWebhook);