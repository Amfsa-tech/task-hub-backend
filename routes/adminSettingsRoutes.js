import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import { getSettings, updateSettings } from '../controllers/adminSettingsController.js';

const router = express.Router();

router.use(protectAdmin);
router.use(allowAdminRoles('super_admin'));

router.get('/', getSettings);
router.patch('/', updateSettings);

export default router;