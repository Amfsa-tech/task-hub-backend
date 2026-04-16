import express from 'express';
import { 
    getMyNotifications, 
    markNotificationRead 
} from '../controllers/notificationController.js';

// Assuming your middleware is named protectUser
import { protectAny } from '../middlewares/authMiddleware.js'; 

const router = express.Router();

/**
 * All routes here are for logged-in Users and Taskers.
 * The controller uses req.user._id to pull the correct alerts.
 */
router.use(protectAny);

// GET /api/notifications
// Frontend pulls this to show the bell icon badge and the dropdown list
router.get('/', getMyNotifications);

// PATCH /api/notifications/:id/read
// Frontend calls this when a user clicks a specific notification
router.patch('/:id/read', markNotificationRead);

export default router;