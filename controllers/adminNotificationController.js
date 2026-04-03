import AdminNotification from '../models/adminNotification.js'; // <-- UPDATED IMPORT
import User from '../models/user.js';       
import Tasker from '../models/tasker.js';   
import { logAdminAction } from '../utils/auditLogger.js';

// GET /api/admin/notifications/stats
export const getNotificationStats = async (req, res) => {
    try {
        const [totalUsers, totalTaskers, totalSent, allNotifications] = await Promise.all([
            User.countDocuments(),
            Tasker.countDocuments(),
            AdminNotification.countDocuments(), // <-- UPDATED
            AdminNotification.find().select('recipientsCount openedCount') // <-- UPDATED
        ]);

        let totalRecipients = 0;
        let totalOpened = 0;

        allNotifications.forEach(notif => {
            totalRecipients += notif.recipientsCount;
            totalOpened += notif.openedCount;
        });

        const openRate = totalRecipients > 0 
            ? Math.round((totalOpened / totalRecipients) * 100) 
            : 0;

        res.status(200).json({
            status: 'success',
            data: {
                totalUsers,
                totalTaskers,
                totalSent,
                openRate: `${openRate}%`
            }
        });
    } catch (error) {
        console.error('Notification stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch notification stats' });
    }
};

// GET /api/admin/notifications
export const getAllNotifications = async (req, res) => {
    try {
        const notifications = await AdminNotification.find() // <-- UPDATED
            .populate('sentBy', 'firstName lastName') 
            .sort({ createdAt: -1 }); 

        res.status(200).json({
            status: 'success',
            results: notifications.length,
            data: notifications
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch notifications' });
    }
};

// POST /api/admin/notifications/send
export const sendNotification = async (req, res) => {
    try {
        const { title, message, type, audience, selectedUserIds } = req.body;

        if (!title || !message || !audience) {
            return res.status(400).json({ status: 'error', message: 'Title, message, and audience are required' });
        }

        let recipientsCount = 0;
        if (audience === 'All Users') {
            recipientsCount = await User.countDocuments();
        } else if (audience === 'All Taskers') {
            recipientsCount = await Tasker.countDocuments();
        } else if (audience === 'Everyone') {
            const users = await User.countDocuments();
            const taskers = await Tasker.countDocuments();
            recipientsCount = users + taskers;
        } else if (audience === 'Selected Users') {
            recipientsCount = selectedUserIds ? selectedUserIds.length : 0;
        }

        // <-- UPDATED HERE
        const newNotification = await AdminNotification.create({
            title,
            message,
            type: type || 'Announcement',
            audience,
            recipientsCount,
            sentBy: req.admin._id
        });

        await logAdminAction({
            adminId: req.admin._id,
            action: 'SENT_NOTIFICATION',
            resourceType: 'AdminNotification',
            resourceId: newNotification._id,
            details: `Sent to ${audience}`,
            req
        });

        res.status(201).json({
            status: 'success',
            message: 'Notification sent successfully',
            data: newNotification
        });

    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send notification' });
    }
};