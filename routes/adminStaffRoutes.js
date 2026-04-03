import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import { 
    getAllStaff, 
    getStaffStats, 
    getStaffById, 
    inviteAdmin,         // <--- Replaced createStaff
    setupAdminAccount,   // <--- Added new setup controller
    updateStaffStatus 
} from '../controllers/adminStaffController.js';

const router = express.Router();

// ==========================================
// PUBLIC ROUTES (No token required)
// ==========================================
// This MUST be public so invited admins can set their passwords from the email link
router.post('/setup', setupAdminAccount);


// ==========================================
// PROTECTED ROUTES (Super Admins Only)
// ==========================================
router.use(protectAdmin);
router.use(allowAdminRoles('super_admin')); 

// 1. Stats
router.get('/stats', getStaffStats);

// 2. List & Invite
router.get('/', getAllStaff);
router.post('/invite', inviteAdmin); // <--- Updated route to match Figma flow

// 3. Details (Must be after /stats)
router.get('/:id', getStaffById); 

// 4. Actions
router.patch('/:id/status', updateStaffStatus);

export default router;