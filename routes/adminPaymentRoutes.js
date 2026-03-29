import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { getPaymentStats, getAllPayments, getPaymentById, getDepositStats, getAllDeposits, getDepositById } from '../controllers/adminPaymentController.js';

const router = express.Router();

router.use(protectAdmin);

router.get('/', getPaymentStats);      // The Cards/Widgets
router.get('/history', getAllPayments);  // The Table/List

// Deposit (wallet funding) endpoints
router.get('/deposits/stats', getDepositStats);
router.get('/deposits', getAllDeposits);
router.get('/deposits/:id', getDepositById);

router.get('/:id', getPaymentById);
export default router;