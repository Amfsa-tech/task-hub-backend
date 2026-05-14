import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import { getDashboardStats, getTodaySignupsList} from '../controllers/adminDashboardController.js';

const router = express.Router();

router.get(
    '/stats',
    protectAdmin,
    allowAdminRoles('super_admin', 'operations', 'trust_safety'),
    getDashboardStats
);

router.get(
    '/today-signups',
    protectAdmin,
    allowAdminRoles('super_admin', 'operations'),
    getTodaySignupsList
);

export default router;
