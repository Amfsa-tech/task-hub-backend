import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';

import {
  getAllTaskers,
  getTaskerById,
  verifyTasker,
  suspendTasker,
  activateTasker,
  sendTaskerEmail,
  lockTasker,
  unlockTasker,
  sendBulkTaskerEmail
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

// Add the lock route
router.patch(
  '/:id/lock',
  protectAdmin,
  allowAdminRoles('super_admin', 'operations'),
  lockTasker
);

// Add the unlock route
router.patch(
  '/:id/unlock',
  protectAdmin,
  allowAdminRoles('super_admin', 'operations'),
  unlockTasker
);

// Fixed path: changed '/taskers/:id/send-email' to '/:id/send-email'
router.post(
  '/:id/send-email', 
  protectAdmin,
  allowAdminRoles('super_admin', 'operations', 'support'), // Added support role for emails
  sendTaskerEmail
);

router.post('/bulk-email',  
   allowAdminRoles('super_admin', 'operations', 'support'),
   sendBulkTaskerEmail);


export default router;