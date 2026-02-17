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
    getReportDetails   
} from '../controllers/adminReportController.js';

const router = express.Router();

// Apply Global Admin Protection
router.use(protectAdmin);

// --- SECTION 1: MODERATION & DISPUTES (Trust & Safety) ---
// View all reports (trust & safety + super admin)
router.get(
    '/',
    allowAdminRoles('super_admin', 'trust_safety'),
    getAllReports
);

// Action: Resolve
router.patch(
    '/:id/resolve',
    allowAdminRoles('super_admin', 'trust_safety'),
    resolveReport
);
router.get('/activity-logs', getAllActivityLogs); // <--- New: Activity Log Page
router.get('/:id', getReportDetails);


// --- SECTION 2: SYSTEM DATA EXPORTS (Super Admin Only) ---
// Export functionality for various dashboard pages
// Restricted to super_admin as these contain sensitive financial/user data

// Tasks Page Export
router.get(
    '/export/tasks',
    allowAdminRoles('super_admin'),
    exportTaskReport
);

// Payments Page Export
router.get(
    '/export/payments',
    allowAdminRoles('super_admin'),
    exportPaymentReport
);

// Dashboard Overview Page Export
router.get(
    '/export/dashboard',
    allowAdminRoles('super_admin'),
    exportDashboardSummary
);

// --- SECTION 2: SYSTEM DATA EXPORTS (Super Admin Only) ---

// User & Tasker Page Exports
router.get(
    '/export/users',
    allowAdminRoles('super_admin'),
    exportUserReport
);

router.get(
    '/export/taskers',
    allowAdminRoles('super_admin'),
    exportTaskerReport
);

// ... existing task, payment, and dashboard export routes

export default router;