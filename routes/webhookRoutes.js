import express from 'express';
import { handleResendWebhook, handleOneSignalWebhook } from '../controllers/webhookController.js';

// 1. Initialize the Express router
const router = express.Router();

// 2. Define the routes (No auth middleware here!)
router.post('/api/webhooks/resend', handleResendWebhook);
router.post('/api/webhooks/onesignal', handleOneSignalWebhook);

// 3. Export the router so index.js can use it
export default router;