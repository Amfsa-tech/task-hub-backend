import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import {
    getAllReports,
    resolveReport,
    exportTaskReport,      
    exportPaymentReport,   
    exportDashboardSummary, 
    exportUserReport,     
    exportTaskerReport,
    getAllActivityLogs,
    getReportDetails,
    getUserSecuritySummary
} from '../controllers/adminReportController.js';

const router = express.Router();

// Apply Global Admin Protection
router.use(protectAdmin);

// --- SECTION 1: ACTIVITY LOGS & AUDIT TRAIL ---
// Place static routes BEFORE parameterized routes (like :id) to avoid collisions
router.get(
    '/activity-logs', 
    allowAdminRoles('super_admin', 'trust_safety', 'operations'), 
    getAllActivityLogs
);
router.get(
    '/activity-logs/summary/:userId', 
    allowAdminRoles('super_admin', 'trust_safety'), 
    getUserSecuritySummary
);

// --- SECTION 2: MODERATION & DISPUTES (Trust & Safety) ---
// View all reports (trust & safety + super admin)
router.get(
    '/',
    allowAdminRoles('super_admin', 'trust_safety'),
    getAllReports
);

// Get specific report details
router.get(
    '/:id', 
    allowAdminRoles('super_admin', 'trust_safety'),
    getReportDetails
);

// Action: Resolve
router.patch(
    '/:id/resolve',
    allowAdminRoles('super_admin', 'trust_safety'),
    resolveReport
);

// --- SECTION 3: SYSTEM DATA EXPORTS (Super Admin Only) ---
// Restricted to super_admin as these contain sensitive financial/user data

router.get('/export/tasks', allowAdminRoles('super_admin'), exportTaskReport);
router.get('/export/payments', allowAdminRoles('super_admin'), exportPaymentReport);
router.get('/export/dashboard', allowAdminRoles('super_admin'), exportDashboardSummary);
router.get('/export/users', allowAdminRoles('super_admin'), exportUserReport);
router.get('/export/taskers', allowAdminRoles('super_admin'), exportTaskerReport);

export default router;