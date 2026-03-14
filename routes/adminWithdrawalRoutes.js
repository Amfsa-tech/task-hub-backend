import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import {
    getWithdrawalStats,
    getAllWithdrawals,
    getWithdrawalById,
    approveWithdrawal,
    rejectWithdrawal,
    completeWithdrawal
} from '../controllers/adminWithdrawalController.js';

const router = express.Router();

router.use(protectAdmin);

// Stats & listing
router.get('/stats', getWithdrawalStats);
router.get('/', getAllWithdrawals);
router.get('/:id', getWithdrawalById);

// Actions (super_admin & operations only)
router.patch('/:id/approve', allowAdminRoles('super_admin', 'operations'), approveWithdrawal);
router.patch('/:id/reject', allowAdminRoles('super_admin', 'operations'), rejectWithdrawal);
router.patch('/:id/complete', allowAdminRoles('super_admin', 'operations'), completeWithdrawal);

export default router;
