import express from 'express';
import { 
    userRegister, 
    userLogin, 
    getUser, 
    taskerRegister, 
    taskerLogin, 
    getTasker,
    verifyEmail,
    resendEmailVerification,
    forgotPassword,
    resetPassword,
    changePassword,
    updateProfile,
    updateProfilePicture,
    updateTaskerCategories,
    logout,
    deactivateAccount,
    updateTaskerLocation,
    updateUserNotificationId,
    updateTaskerNotificationId,
    removeUserNotificationId,
    removeTaskerNotificationId,
    verifyTaskerIdentity,
    getTaskerVerificationStatus, 
    getMe
} from '../controllers/auth-controller.js';
import { protectUser, protectTasker, protectAny } from '../middlewares/authMiddleware.js';

const router = express.Router();

// User routes
router.post('/user-register', userRegister);
router.post('/user-login', userLogin);
router.get('/user', protectUser, getUser);

// Tasker routes
router.post('/tasker-register', taskerRegister);
router.post('/tasker-login', taskerLogin);
router.get('/tasker', protectTasker, getTasker);

// Email verification routes (public)
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendEmailVerification);

// Password reset routes (public)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes (require authentication)
router.post('/change-password', protectAny, changePassword);
router.put('/profile', protectAny, updateProfile);
router.put('/profile-picture', protectAny, updateProfilePicture);
router.put('/categories', protectTasker, updateTaskerCategories);
router.put('/location', protectTasker, updateTaskerLocation);
router.post('/logout', protectAny, logout);
router.post('/deactivate-account', protectAny, deactivateAccount);

// Push Notification ID routes
router.put('/user/notification-id', protectUser, updateUserNotificationId);
router.put('/tasker/notification-id', protectTasker, updateTaskerNotificationId);
router.delete('/user/notification-id', protectUser, removeUserNotificationId);
router.delete('/tasker/notification-id', protectTasker, removeTaskerNotificationId);

// NIN Identity Verification routes (tasker only)
router.post('/verify-identity', protectTasker, verifyTaskerIdentity); 
router.get('/verification-status', protectTasker, getTaskerVerificationStatus);

router.get('/me', protectUser, getMe);


export default router;