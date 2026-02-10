import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import {
    getAllReports,
    resolveReport,
    dismissReport
} from '../controllers/adminReportController.js';

const router = express.Router();

// View all reports (trust & safety + super admin)
router.get(
    '/',
    protectAdmin,
    allowAdminRoles('super_admin', 'trust_safety'),
    getAllReports
);

// Resolve report
router.patch(
    '/:id/resolve',
    protectAdmin,
    allowAdminRoles('super_admin', 'trust_safety'),
    resolveReport
);

// Dismiss report
router.patch(
    '/:id/dismiss',
    protectAdmin,
    allowAdminRoles('super_admin', 'trust_safety'),
    dismissReport
);

export default router;
