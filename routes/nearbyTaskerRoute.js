import { Router } from 'express';
import { getNearbyTaskers } from '../controllers/nearbyTaskerController.js';

const router = Router();

// Public route — no authentication required
router.get('/nearby', getNearbyTaskers);

export default router;
