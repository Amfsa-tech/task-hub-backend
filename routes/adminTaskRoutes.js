import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import {
    getAllTasks,
    getTaskById,
    getTaskStats,
    forceCancelTask,
    forceCompleteTask
} from '../controllers/adminTaskController.js';

const router = express.Router();

// All admins
router.get('/stats',
     protectAdmin, 
     getTaskStats);
     
router.get(
    '/',
    protectAdmin,
    getAllTasks
);

router.get(
    '/:id',
    protectAdmin,
    getTaskById
);

// Operations & super admin only
router.patch(
    '/:id/cancel',
    protectAdmin,
    allowAdminRoles('super_admin', 'operations'),
    forceCancelTask
);

router.patch(
    '/:id/complete',
    protectAdmin,
    allowAdminRoles('super_admin', 'operations'),
    forceCompleteTask
);

export default router;
