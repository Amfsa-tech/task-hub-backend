import Notification from '../models/notification.js';
import * as Sentry from '@sentry/node';

const ownsNotification = (notification, accountId) => {
    const id = accountId.toString();
    return (
        notification.user?.toString() === id ||
        notification.tasker?.toString() === id
    );
};

/**
 * GET /api/notifications
 * Fetches the logged-in user's or tasker's notifications
 */
export const getMyNotifications = async (req, res) => {
    try {
        const userId = req.user._id; // Works for both User and Tasker depending on who logged in

        // Find notifications where either the user OR tasker field matches their ID
        const notifications = await Notification.find({
            $or: [{ user: userId }, { tasker: userId }],
            type: { $ne: 'chat' }
        })
        .sort({ createdAt: -1 }) // Newest first
        .limit(20); // Just fetch the last 20 to keep the app fast

        // Count how many are unread for the little red bell badge
        const unreadCount = notifications.filter(n => !n.read).length;

        return res.json({
            status: 'success',
            data: {
                unreadCount,
                notifications
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Get notifications error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch notifications' });
    }
};

/**
 * PATCH /api/notifications/:id/read
 * Marks a specific notification as read when they click it
 */
export const markNotificationRead = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({ status: 'error', message: 'Notification not found' });
        }

        // Security check: Ensure this notification actually belongs to the person clicking it
        if (!ownsNotification(notification, req.user._id)) {
            return res.status(403).json({ status: 'error', message: 'Unauthorized' });
        }

        notification.read = true;
        await notification.save();

        return res.json({ status: 'success', message: 'Marked as read' });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Mark read error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to update notification' });
    }
};

/**
 * DELETE /api/notifications/:id
 * Permanently deletes a specific notification owned by the logged-in user/tasker
 */
export const deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({ status: 'error', message: 'Notification not found' });
        }

        // Security check: Ensure this notification actually belongs to the person deleting it
        if (!ownsNotification(notification, req.user._id)) {
            return res.status(403).json({ status: 'error', message: 'Unauthorized' });
        }

        await Notification.deleteOne({ _id: notification._id });

        return res.json({ status: 'success', message: 'Notification deleted successfully' });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Delete notification error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to delete notification' });
    }
};

/**
 * PATCH /api/notifications/read-all
 * Marks ALL notifications as read for the logged-in user/tasker
 */
export const markAllNotificationsRead = async (req, res) => {
    try {
        const userId = req.user._id;

        const result = await Notification.updateMany(
            {
                $or: [{ user: userId }, { tasker: userId }],
                type: { $ne: 'chat' },
                read: false
            },
            { $set: { read: true } }
        );

        return res.json({
            status: 'success',
            message: 'All notifications marked as read',
            data: { modifiedCount: result.modifiedCount }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Mark all read error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to update notifications' });
    }
};
