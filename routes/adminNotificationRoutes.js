import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { allowAdminRoles } from '../middlewares/adminRoleGuard.js';
import { 
    getNotificationStats, 
    getAllNotifications, 
    sendNotification,
    getAllUserAndTaskerNotifications,
    resendNotification // <-- NEW IMPORT
} from '../controllers/adminNotificationController.js';

const router = express.Router();

// Require admin auth for all notification routes
router.use(protectAdmin);
// Restrict sending notifications to certain roles
router.use(allowAdminRoles('super_admin', 'operations', 'support')); 

// 1. Stats (Top Cards)
router.get('/stats', getNotificationStats);

// 2. Table List
router.get('/', getAllNotifications);

// 3. Send Notification
router.post('/send', sendNotification);

// 4. Get All Users and Taskers
router.get('/all-users', getAllUserAndTaskerNotifications); 

// 5. Resend Notification (NEW ROUTE)
router.post('/:id/resend', resendNotification);

export default router;