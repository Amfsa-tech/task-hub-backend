import ActivityLog from '../models/ActivityLog.js';
import * as Sentry from '@sentry/node';

/**
 * Logs a user or tasker activity to the database.
 * @param {Object} req - The express request object (to extract IP and UA)
 * @param {String} action - The action string (e.g., 'LOGIN')
 * @param {Object} metadata - Optional extra data (e.g., { amount: 5000 })
 * @param {String} status - 'success' or 'failed'
 */
export const logActivity = async (req, action, metadata = {}, status = 'success') => {
    try {
        if (!req.user) return; // Can't log if we don't know who it is

        await ActivityLog.create({
            performedBy: req.user._id,
            onModel: req.userType === 'tasker' ? 'Tasker' : 'User',
            action,
            status,
            ipAddress: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            metadata
        });
    } catch (error) {
        // We console.error but don't throw, so a logging failure doesn't crash the main app
        console.error('Activity Logging Failed:', error);
        Sentry.captureException(error);
    }
};