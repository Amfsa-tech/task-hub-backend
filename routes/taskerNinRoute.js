import express from 'express';
import { protectAny } from '../middlewares/authMiddleware.js';
import { submitNINForReview } from '../controllers/ninController.js';

const router = express.Router();

router.post('/submit-nin', protectAny, submitNINForReview);

export default router;
