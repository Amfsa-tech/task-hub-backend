import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import {
    getAllUniversities,
    createUniversity,
    updateUniversity,
    deleteUniversity
} from '../controllers/adminUniversityController.js';

const router = express.Router();

router.use(protectAdmin);

// View (Super Admins, Operations, Trust & Safety)
router.get('/', allowAdminRoles('super_admin', 'operations', 'trust_safety'), getAllUniversities);

// Create & Update (Super Admins & Operations)
router.post('/', allowAdminRoles('super_admin', 'operations'), createUniversity);
router.patch('/:id', allowAdminRoles('super_admin', 'operations'), updateUniversity);

// Delete (Super Admins & Operations)
router.delete('/:id', allowAdminRoles('super_admin', 'operations'), deleteUniversity);

export default router;
