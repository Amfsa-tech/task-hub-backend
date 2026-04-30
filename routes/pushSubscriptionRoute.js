import express from 'express';
import { subscribePush, unsubscribePush, getVapidPublicKey } from '../controllers/pushSubscriptionController.js';
import { protectAny } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public: Get VAPID public key (needed before subscribing)
router.get('/vapid-public-key', getVapidPublicKey);

// Authenticated: Subscribe / unsubscribe browser push
router.post('/subscribe', protectAny, subscribePush);
router.post('/unsubscribe', protectAny, unsubscribePush);

export default router;