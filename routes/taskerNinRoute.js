import express from 'express';
import { protectTasker } from '../middlewares/authMiddleware.js';
import { submitTaskerNIN } from '../controllers/ninController.js';

const router = express.Router();

router.post('/submit-nin', protectTasker, submitTaskerNIN);

export default router;
