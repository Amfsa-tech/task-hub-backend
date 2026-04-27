import * as Sentry from '@sentry/node';
import AdminAuditLog from '../models/adminAuditLog.js';

export const logAdminAction = async ({
    adminId,
    action,
    resourceType,
    resourceId,
    req,
    metadata = {}
}) => {
    try {
        await AdminAuditLog.create({
            admin: adminId,
            action,
            resourceType,
            resourceId,
            metadata,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
    } catch (error) {
        console.error('Admin audit log failed:', error.message);
        Sentry.captureException(error);
    }
};
