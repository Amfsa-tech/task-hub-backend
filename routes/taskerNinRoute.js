import express from 'express';
import { protectAny } from '../middlewares/authMiddleware.js';
import { submitNIN } from '../controllers/ninController.js';

const router = express.Router();

router.post('/submit-nin', protectAny, submitNIN);

export default router;
