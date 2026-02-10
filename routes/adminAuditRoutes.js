import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import { getAuditLogs } from '../controllers/adminAuditController.js';

const router = express.Router();

router.get(
    '/',
    protectAdmin,
    allowAdminRoles('super_admin'),
    getAuditLogs
);

export default router;
