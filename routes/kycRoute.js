import { Router } from 'express';
import {
  handleDiditWebhook,
  getVerificationStatus,
  registerSession,
} from '../controllers/diditWebhookController.js';
import { verifyDiditSignature } from '../middlewares/diditWebhookAuth.js';
import { protectUser } from '../middlewares/authMiddleware.js';

const router = Router();

// Didit webhook — verified by HMAC signature, no JWT auth
router.post('/didit-webhook', verifyDiditSignature, handleDiditWebhook);

// Register a Didit session_id → userId mapping (call after creating Didit session)
router.post('/register-session', protectUser, registerSession);

// Verification status — requires authenticated user
router.get('/verification-status', protectUser, getVerificationStatus);

export default router;
