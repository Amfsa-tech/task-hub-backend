import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { getPaymentStats, getAllPayments,getPaymentById } from '../controllers/adminPaymentController.js';

const router = express.Router();

router.use(protectAdmin);

router.get('/', getPaymentStats);      // The Cards/Widgets
router.get('/history', getAllPayments);  // The Table/List
router.get('/:id', getPaymentById);
export default router;