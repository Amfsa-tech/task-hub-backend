import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import { getPaymentStats } from '../controllers/adminPaymentController.js';

const router = express.Router();

router.get(
  '/stats',
  protectAdmin,
  allowAdminRoles('super_admin', 'finance', 'operations'),
  getPaymentStats
);

export default router;