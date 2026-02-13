import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js'; // Optional: restrict audit viewing to super_admin
import { getAuditLogs, getAuditFilters } from '../controllers/adminAuditController.js';

const router = express.Router();

// Apply protection globally to these routes
router.use(protectAdmin);

// Routes
router.get('/', getAuditLogs); // Standard list with params
router.get('/filters', getAuditFilters); // Helper for dropdowns

export default router;