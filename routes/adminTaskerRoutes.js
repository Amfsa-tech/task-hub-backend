import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';

import {
  getAllTaskers,
  getTaskerById,
  verifyTasker,
  suspendTasker,
  activateTasker // <--- ADDED THIS IMPORT
} from '../controllers/adminTaskerController.js';

const router = express.Router();

// All admins
router.get(
  '/',
  protectAdmin,
  getAllTaskers
);

router.get(
  '/:id',
  protectAdmin,
  getTaskerById
);

// Super admin & operations only
router.patch(
  '/:id/verify',
  protectAdmin,
  allowAdminRoles('super_admin', 'operations'),
  verifyTasker
);

router.patch(
  '/:id/suspend',
  protectAdmin,
  allowAdminRoles('super_admin', 'operations'),
  suspendTasker
);

// Add the activate route
router.patch(
  '/:id/activate',
  protectAdmin,
  allowAdminRoles('super_admin', 'operations'),
  activateTasker
);

export default router;