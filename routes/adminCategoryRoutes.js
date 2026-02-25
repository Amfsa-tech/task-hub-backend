import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import {
    getAdminCategoriesDashboard,
    getAdminCategoryDetails,
    createAdminCategory,
    updateAdminCategory
} from '../controllers/adminCategoryController.js';

const router = express.Router();

// All routes require a valid Admin JWT
router.use(protectAdmin);

// View Categories (Super Admins, Operations, Trust & Safety)
router.get('/', allowAdminRoles('super_admin', 'operations', 'trust_safety'), getAdminCategoriesDashboard);
router.get('/:id', allowAdminRoles('super_admin', 'operations', 'trust_safety'), getAdminCategoryDetails);

// Modify Categories (Super Admins & Operations ONLY)
router.post('/', allowAdminRoles('super_admin', 'operations'), createAdminCategory);
router.patch('/:id', allowAdminRoles('super_admin', 'operations'), updateAdminCategory);

export default router;