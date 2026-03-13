import { Router } from 'express';
import { joinWaitlist, getWaitlistEmails } from '../controllers/waitlistController.js';
import { protectAdmin } from '../middlewares/adminMiddleware.js';

const router = Router();

// Public — anyone can join the waitlist
router.post('/', joinWaitlist);

// Admin-protected — retrieve all waitlist emails
router.get('/', protectAdmin, getWaitlistEmails);

export default router;
