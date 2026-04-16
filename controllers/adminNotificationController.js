import AdminNotification from '../models/adminNotification.js'; // <-- UPDATED IMPORT
import User from '../models/user.js';       
import Tasker from '../models/tasker.js';   
import { logAdminAction } from '../utils/auditLogger.js';
import Notification from '../models/notification.js'; // <-- ADD THIS IMPORT AT THE TOP

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
        let notificationsToInsert = []; // Array to hold all the individual notifications

        if (audience === 'All Users') {
            const users = await User.find().select('_id');
            recipientsCount = users.length;
            notificationsToInsert = users.map(u => ({
                user: u._id, title, message, type: type || 'Announcement'
            }));
        } else if (audience === 'All Taskers') {
            const taskers = await Tasker.find().select('_id');
            recipientsCount = taskers.length;
            notificationsToInsert = taskers.map(t => ({
                tasker: t._id, title, message, type: type || 'Announcement'
            }));
        } else if (audience === 'Everyone') {
            const users = await User.find().select('_id');
            const taskers = await Tasker.find().select('_id');
            recipientsCount = users.length + taskers.length;
            
            const userNotifs = users.map(u => ({ user: u._id, title, message, type: type || 'Announcement' }));
            const taskerNotifs = taskers.map(t => ({ tasker: t._id, title, message, type: type || 'Announcement' }));
            notificationsToInsert = [...userNotifs, ...taskerNotifs];
        } else if (audience === 'Selected Users') {
            // Assuming selectedUserIds might contain both User and Tasker IDs
            recipientsCount = selectedUserIds ? selectedUserIds.length : 0;
            
            if (recipientsCount > 0) {
                // Since we don't know if the IDs are Users or Taskers from the frontend easily, 
                // we have to check. A simpler way if you strictly pass User IDs:
                notificationsToInsert = selectedUserIds.map(id => ({
                    user: id, // WARNING: If frontend passes Tasker IDs here, update this logic!
                    title, message, type: type || 'Announcement'
                }));
            }
        }

        // 1. Log the broadcast receipt for the Admin
        const newNotification = await AdminNotification.create({
            title,
            message,
            type: type || 'Announcement',
            audience,
            recipientsCount,
            sentBy: req.admin._id
        });

        // 2. ACTUALLY SEND THE NOTIFICATIONS TO THE USERS/TASKERS
        if (notificationsToInsert.length > 0) {
            await Notification.insertMany(notificationsToInsert);
        }

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