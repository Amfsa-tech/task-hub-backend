import AdminSettings from '../models/adminSettings.js';
import { logAdminAction } from '../utils/auditLogger.js';
import * as Sentry from '@sentry/node';

// GET /api/admin/settings
export const getSettings = async (req, res) => {
    try {
        let settings = await AdminSettings.findOne();
        
        // Initialize settings if they don't exist yet
        if (!settings) {
            settings = await AdminSettings.create({});
        }

        res.json({ status: 'success', data: settings });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch settings' });
    }
};

// PATCH /api/admin/settings
export const updateSettings = async (req, res) => {
    try {
        const updates = req.body;
        
        const settings = await AdminSettings.findOneAndUpdate(
            {}, 
            { $set: updates }, 
            { new: true, upsert: true }
        );

        await logAdminAction({
            adminId: req.admin._id,
            action: 'UPDATE_SETTINGS',
            resourceType: 'Settings',
            req
        });

        res.json({ status: 'success', message: 'Settings updated', data: settings });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to update settings' });
    }
};