import * as Sentry from '@sentry/node';
import AdminSettings from '../models/adminSettings.js';

export const checkMaintenanceMode = async (req, res, next) => {
    try {
        const settings = await AdminSettings.findOne();

        if (settings?.system?.maintenanceMode) {
            // Bypass for Admins (req.admin is set by protectAdmin middleware)
            if (req.admin) {
                return next();
            }

            // Optional: Log the blocked attempt for your Activity Log
            console.log(`Maintenance Block: ${req.method} ${req.originalUrl} from ${req.ip}`);

            return res.status(503).json({
                status: 'error',
                message: 'System is currently under maintenance. Please try again later.',
                maintenance: true
            });
        }

        next();
    } catch (error) {
        console.error('Maintenance mode check error:', error);
        Sentry.captureException(error);
        next();
    }
};