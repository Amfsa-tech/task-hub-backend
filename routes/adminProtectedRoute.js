import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';

const router = express.Router();

// All authenticated admins
router.get(
    '/',
    protectAdmin,
    (req, res) => {
        res.json({
            status: 'success',
            admin: req.admin
        });
    }
);

// Only super admins
router.get(
    '/system-stats',
    protectAdmin,
    allowAdminRoles('super_admin'),
    (req, res) => {
        res.json({
            status: 'success',
            message: 'Super admin access granted'
        });
    }
);

// Operations & super admins
router.post(
    '/categories',
    protectAdmin,
    allowAdminRoles('super_admin', 'operations'),
    (req, res) => {
        res.json({
            status: 'success',
            message: 'Category created (placeholder)'
        });
    }
);

export default router;
