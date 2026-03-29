import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import {
    getAllMainCategories,
    createMainCategory,
    updateMainCategory,
    deleteMainCategory
} from '../controllers/adminMainCategoryController.js';

const router = express.Router();

router.use(protectAdmin);

// View (Super Admins, Operations, Trust & Safety)
router.get('/', allowAdminRoles('super_admin', 'operations', 'trust_safety'), getAllMainCategories);

// Create & Update (Super Admins & Operations)
router.post('/', allowAdminRoles('super_admin', 'operations'), createMainCategory);
router.patch('/:id', allowAdminRoles('super_admin', 'operations'), updateMainCategory);

// Delete (Super Admins & Operations)
router.delete('/:id', allowAdminRoles('super_admin', 'operations'), deleteMainCategory);

export default router;
