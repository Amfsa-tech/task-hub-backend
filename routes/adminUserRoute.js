import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import {
    getAllUsers,
    getUserById,
    activateUser,
    deactivateUser,
    lockUser,
    unlockUser,
    softDeleteUser,
    restoreUser
} from '../controllers/adminUserController.js';

const router = express.Router();

router.use(protectAdmin);

// View users
router.get(
    '/',
    allowAdminRoles('super_admin', 'trust_safety'),
    getAllUsers
);

router.get(
    '/:id',
    allowAdminRoles('super_admin', 'trust_safety'),
    getUserById
);

// Account actions
router.patch(
    '/:id/activate',
    allowAdminRoles('super_admin'),
    activateUser
);

router.patch(
    '/:id/deactivate',
    allowAdminRoles('super_admin'),
    deactivateUser
);

router.patch(
    '/:id/lock',
    allowAdminRoles('super_admin', 'trust_safety'),
    lockUser
);

router.patch(
    '/:id/unlock',
    allowAdminRoles('super_admin', 'trust_safety'),
    unlockUser
);

// DELETE /api/admin/users/:id
router.delete(
    '/:id',
    protectAdmin,
    allowAdminRoles('super_admin'),
    softDeleteUser
);

router.patch(
    '/:id/restore',
    allowAdminRoles('super_admin'),
    restoreUser
);


export default router;
