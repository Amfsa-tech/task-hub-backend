import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';

import {
    getAllKycRequests,
    approveKyc,
    rejectKyc,
    getKycStats
} from '../controllers/adminKycController.js';

const router = express.Router();

router.use(protectAdmin);

router.get('/', allowAdminRoles('super_admin'), getAllKycRequests);
router.patch('/:id/approve', allowAdminRoles('super_admin'), approveKyc);
router.get(
    '/stats',
    allowAdminRoles('super_admin'),
    getKycStats
);
router.patch('/:id/reject', allowAdminRoles('super_admin'), rejectKyc);



export default router;
