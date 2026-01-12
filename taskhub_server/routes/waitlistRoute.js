import { Router } from 'express';
import { joinWaitlist } from '../controllers/waitlist-controller.js';

const router = Router();

// Public route: join waitlist (idempotent)
router.post('/', joinWaitlist);

export default router;
