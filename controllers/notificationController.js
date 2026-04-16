import Notification from '../models/notification.js';

/**
 * GET /api/notifications
 * Fetches the logged-in user's or tasker's notifications
 */
export const getMyNotifications = async (req, res) => {
    try {
        const userId = req.user._id; // Works for both User and Tasker depending on who logged in

        // Find notifications where either the user OR tasker field matches their ID
        const notifications = await Notification.find({
            $or: [{ user: userId }, { tasker: userId }]
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
        if (
            (notification.user && notification.user.toString() !== req.user._id.toString()) &&
            (notification.tasker && notification.tasker.toString() !== req.user._id.toString())
        ) {
            return res.status(403).json({ status: 'error', message: 'Unauthorized' });
        }

        notification.read = true;
        await notification.save();

        return res.json({ status: 'success', message: 'Marked as read' });
    } catch (error) {
        console.error('Mark read error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to update notification' });
    }
};