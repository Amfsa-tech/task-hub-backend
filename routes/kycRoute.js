import { Router } from 'express';
import {
  handleDiditWebhook,
  getVerificationStatus,
  registerSession,
} from '../controllers/diditWebhookController.js';
import { verifyDiditSignature } from '../middlewares/diditWebhookAuth.js';
import { protectAny } from '../middlewares/authMiddleware.js';

const router = Router();

// Didit webhook — verified by HMAC signature, no JWT auth
router.post('/didit-webhook', verifyDiditSignature, handleDiditWebhook);

// Register a Didit session_id → userId mapping (call after creating Didit session)
router.post('/register-session', protectAny, registerSession);

// Verification status — requires authenticated user or tasker
router.get('/verification-status', protectAny, getVerificationStatus);

export default router;
