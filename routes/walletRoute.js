import { Router } from 'express';
import { protectUser } from '../middlewares/authMiddleware.js';
import { initializeFunding, verifyFunding } from '../controllers/walletController.js';
import { handlePaystackWebhook } from '../controllers/paystackWebhookController.js';
import { verifyPaystackSignature } from '../middlewares/paystackWebhookAuth.js';

const router = Router();

// User-facing endpoints (JWT protected)
router.post('/fund/initialize', protectUser, initializeFunding);
router.get('/fund/verify', protectUser, verifyFunding);

// Paystack webhook — no JWT auth, verified by HMAC signature
// NOTE: This route expects raw body (Buffer). The raw body parser is applied
// at the app level in index.js before express.json() kicks in.
router.post('/paystack-webhook', verifyPaystackSignature, handlePaystackWebhook);

export default router;
