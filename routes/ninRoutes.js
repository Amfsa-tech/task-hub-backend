import express from 'express';
import { protectUser } from '../middlewares/authMiddleware.js';
import { submitNIN } from '../controllers/ninController.js';

const router = express.Router();

router.post('/verify-nin', protectUser, submitNIN);

export default router;
