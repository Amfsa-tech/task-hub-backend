import { Router } from 'express';
import {
  handleDiditWebhook,
  getVerificationStatus,
} from '../controllers/diditWebhookController.js';
import { verifyDiditSignature } from '../middlewares/diditWebhookAuth.js';
import { protectUser } from '../middlewares/authMiddleware.js';

const router = Router();

// Didit webhook — verified by HMAC signature, no JWT auth
router.post('/didit-webhook', verifyDiditSignature, handleDiditWebhook);

// Verification status — requires authenticated user
router.get('/verification-status', protectUser, getVerificationStatus);

export default router;
