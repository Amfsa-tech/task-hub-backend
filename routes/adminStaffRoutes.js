import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import { 
    getAllStaff, 
    getStaffStats, 
    getStaffById, // <--- Import this
    createStaff, 
    updateStaffStatus 
} from '../controllers/adminStaffController.js';

const router = express.Router();

router.use(protectAdmin);
router.use(allowAdminRoles('super_admin')); 

// 1. Stats
router.get('/stats', getStaffStats);

// 2. List & Create
router.get('/', getAllStaff);
router.post('/', createStaff);

// 3. Details (Must be after /stats)
router.get('/:id', getStaffById); // <--- Add this line

// 4. Actions
router.patch('/:id/status', updateStaffStatus);

export default router;