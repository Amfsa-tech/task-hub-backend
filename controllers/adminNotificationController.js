import AdminNotification from '../models/adminNotification.js'; // <-- UPDATED IMPORT
import User from '../models/user.js';       
import Tasker from '../models/tasker.js';   
import { logAdminAction } from '../utils/auditLogger.js';
import Notification from '../models/notification.js'; // <-- ADD THIS IMPORT AT THE TOP
import { sendEmail } from '../services/emailService.js'; // Adjust the path as needed
import * as Sentry from '@sentry/node';
// Make sure this is at the top of adminNotificationController.js


// GET /api/admin/notifications/all-users

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
        Sentry.captureException(error);
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
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch notifications' });
    }
};

// POST /api/admin/notifications/send
export const sendNotification = async (req, res) => {
    try {
        // ADDED: 'sentThrough' extracted from req.body
        const { title, message, type, audience, selectedUserIds, sentThrough } = req.body;

        if (!title || !message || !audience) {
            return res.status(400).json({ status: 'error', message: 'Title, message, and audience are required' });
        }

        // Fallback: If frontend hasn't updated yet, default to both. Otherwise, use what they checked.
        const activesentThrough = sentThrough && sentThrough.length > 0 ? sentThrough : ['Email', 'In-App'];

        let recipientsCount = 0;
        let notificationsToInsert = []; 
        let emailRecipients = [];

        if (audience === 'All Users') {
            const users = await User.find().select('_id emailAddress fullName');
            recipientsCount = users.length;
            users.forEach(u => {
                notificationsToInsert.push({ user: u._id, title, message, type: type || 'Announcement' });
                if (u.emailAddress) emailRecipients.push({ to: u.emailAddress, name: u.fullName });
            });
        } else if (audience === 'All Taskers') {
            const taskers = await Tasker.find().select('_id emailAddress firstName');
            recipientsCount = taskers.length;
            taskers.forEach(t => {
                notificationsToInsert.push({ tasker: t._id, title, message, type: type || 'Announcement' });
                if (t.emailAddress) emailRecipients.push({ to: t.emailAddress, name: t.firstName });
            });
        } else if (audience === 'Everyone') {
            const users = await User.find().select('_id emailAddress fullName');
            const taskers = await Tasker.find().select('_id emailAddress firstName');
            recipientsCount = users.length + taskers.length;
            
            users.forEach(u => {
                notificationsToInsert.push({ user: u._id, title, message, type: type || 'Announcement' });
                if (u.emailAddress) emailRecipients.push({ to: u.emailAddress, name: u.fullName });
            });
            taskers.forEach(t => {
                notificationsToInsert.push({ tasker: t._id, title, message, type: type || 'Announcement' });
                if (t.emailAddress) emailRecipients.push({ to: t.emailAddress, name: t.firstName });
            });
        } else if (audience === 'Selected Users') {
            recipientsCount = selectedUserIds ? selectedUserIds.length : 0;
            if (recipientsCount > 0) {
                const matchedUsers = await User.find({ _id: { $in: selectedUserIds } }).select('_id emailAddress fullName');
                const matchedTaskers = await Tasker.find({ _id: { $in: selectedUserIds } }).select('_id emailAddress firstName');

                matchedUsers.forEach(u => {
                    notificationsToInsert.push({ user: u._id, title, message, type: type || 'Announcement' });
                    if (u.emailAddress) emailRecipients.push({ to: u.emailAddress, name: u.fullName });
                });
                matchedTaskers.forEach(t => {
                    notificationsToInsert.push({ tasker: t._id, title, message, type: type || 'Announcement' });
                    if (t.emailAddress) emailRecipients.push({ to: t.emailAddress, name: t.firstName });
                });
            }
        }

        // ADDED: Save the activesentThrough to the database so the frontend table can read it later
        const newNotification = await AdminNotification.create({
            title, 
            message, 
            type: type || 'Announcement', 
            audience, 
            sentThrough: activesentThrough, // <--- SAVED HERE
            recipientsCount, 
            selectedUserIds: audience === 'Selected Users' ? selectedUserIds : [],
            sentBy: req.admin._id
        });

        // ONLY fire In-App DB insertions if the Admin checked "In-App"
        if (activesentThrough.includes('In-App') && notificationsToInsert.length > 0) {
            const BATCH_SIZE = 1000;
            for (let i = 0; i < notificationsToInsert.length; i += BATCH_SIZE) {
                await Notification.insertMany(notificationsToInsert.slice(i, i + BATCH_SIZE));
            }
        }

        // ONLY fire Resend emails if the Admin checked "Email"
        if (activesentThrough.includes('Email') && emailRecipients.length > 0) {
            console.log(`Starting background email blast to ${emailRecipients.length} recipients...`);
            setTimeout(async () => {
                const CHUNK_SIZE = 50; 
                for (let i = 0; i < emailRecipients.length; i += CHUNK_SIZE) {
                    const chunk = emailRecipients.slice(i, i + CHUNK_SIZE);
                    await Promise.all(chunk.map(recipient => 
                        sendEmail({
                            to: recipient.to,
                            subject: title,
                            html: customAdminEmailHtml({ name: recipient.name || 'there', message }),
                            dbNotificationId: newNotification._id 
                        })
                    ));
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log('Background email blast completed!');
            }, 0);
        }

        await logAdminAction({
            adminId: req.admin._id, action: 'SENT_NOTIFICATION',
            resourceType: 'AdminNotification', resourceId: newNotification._id,
            details: `Sent to ${audience} via ${activesentThrough.join(', ')}`, req
        });

        res.status(201).json({
            status: 'success',
            message: 'Notification queued and sent successfully',
            data: newNotification
        });

    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send notification' });
    }
};

// POST /api/admin/notifications/:id/resend
export const resendNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const notificationRecord = await AdminNotification.findById(id);

        if (!notificationRecord) {
            return res.status(404).json({ status: 'error', message: 'Notification record not found' });
        }

        // Pull the sentThrough it was originally sent with
        const { title, message, type, audience, sentThrough } = notificationRecord;
        const activesentThrough = sentThrough && sentThrough.length > 0 ? sentThrough : ['Email', 'In-App'];

        let recipientsCount = 0;
        let notificationsToInsert = []; 
        let emailRecipients = [];

        if (audience === 'All Users') {
            const users = await User.find().select('_id emailAddress fullName');
            recipientsCount = users.length;
            users.forEach(u => {
                notificationsToInsert.push({ user: u._id, title, message, type: type || 'Announcement' });
                if (u.emailAddress) emailRecipients.push({ to: u.emailAddress, name: u.fullName });
            });
        } else if (audience === 'All Taskers') {
            const taskers = await Tasker.find().select('_id emailAddress firstName');
            recipientsCount = taskers.length;
            taskers.forEach(t => {
                notificationsToInsert.push({ tasker: t._id, title, message, type: type || 'Announcement' });
                if (t.emailAddress) emailRecipients.push({ to: t.emailAddress, name: t.firstName });
            });
        } else if (audience === 'Everyone') {
            const users = await User.find().select('_id emailAddress fullName');
            const taskers = await Tasker.find().select('_id emailAddress firstName');
            recipientsCount = users.length + taskers.length;
            users.forEach(u => {
                notificationsToInsert.push({ user: u._id, title, message, type: type || 'Announcement' });
                if (u.emailAddress) emailRecipients.push({ to: u.emailAddress, name: u.fullName });
            });
            taskers.forEach(t => {
                notificationsToInsert.push({ tasker: t._id, title, message, type: type || 'Announcement' });
                if (t.emailAddress) emailRecipients.push({ to: t.emailAddress, name: t.firstName });
            });
        } else if (audience === 'Selected Users') {
            const savedUserIds = notificationRecord.selectedUserIds || [];
            recipientsCount = savedUserIds.length;
            if (recipientsCount > 0) {
                const matchedUsers = await User.find({ _id: { $in: savedUserIds } }).select('_id emailAddress fullName');
                const matchedTaskers = await Tasker.find({ _id: { $in: savedUserIds } }).select('_id emailAddress firstName');

                matchedUsers.forEach(u => {
                    notificationsToInsert.push({ user: u._id, title, message, type: type || 'Announcement' });
                    if (u.emailAddress) emailRecipients.push({ to: u.emailAddress, name: u.fullName });
                });
                matchedTaskers.forEach(t => {
                    notificationsToInsert.push({ tasker: t._id, title, message, type: type || 'Announcement' });
                    if (t.emailAddress) emailRecipients.push({ to: t.emailAddress, name: t.firstName });
                });
            } else {
                 return res.status(400).json({ status: 'error', message: 'Cannot resend: No selected users were saved in this record.' });
            }
        }

        // ONLY fire In-App DB insertions if the original channel included "In-App"
        if (activesentThrough.includes('In-App') && notificationsToInsert.length > 0) {
            const BATCH_SIZE = 1000;
            for (let i = 0; i < notificationsToInsert.length; i += BATCH_SIZE) {
                await Notification.insertMany(notificationsToInsert.slice(i, i + BATCH_SIZE));
            }
        }

        // ONLY fire Resend emails if the original channel included "Email"
        if (activesentThrough.includes('Email') && emailRecipients.length > 0) {
            console.log(`Starting background email blast for RESEND to ${emailRecipients.length} recipients...`);
            setTimeout(async () => {
                const CHUNK_SIZE = 50; 
                for (let i = 0; i < emailRecipients.length; i += CHUNK_SIZE) {
                    const chunk = emailRecipients.slice(i, i + CHUNK_SIZE);
                    await Promise.all(chunk.map(recipient => 
                        sendEmail({
                            to: recipient.to,
                            subject: `[Reminder] ${title}`,
                            html: customAdminEmailHtml({ name: recipient.name || 'there', message }),
                            dbNotificationId: notificationRecord._id
                        })
                    ));
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log('Background email blast RESEND completed!');
            }, 0);
        }

        notificationRecord.resentCount = (notificationRecord.resentCount || 0) + 1;
        notificationRecord.lastSentAt = Date.now();
        notificationRecord.recipientsCount = recipientsCount; 
        await notificationRecord.save();

        await logAdminAction({
            adminId: req.admin._id, action: 'RESENT_NOTIFICATION',
            resourceType: 'AdminNotification', resourceId: notificationRecord._id,
            details: `Resent to ${audience} via ${activesentThrough.join(', ')} (Count: ${notificationRecord.resentCount})`, req
        });

        res.status(200).json({
            status: 'success',
            message: 'Notification queued and resent successfully',
            data: notificationRecord
        });

    } catch (error) {
        console.error('Resend notification error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to resend notification' });
    }
};

export const getAllUserAndTaskerNotifications = async (req, res) => {
    try {
        // 1. Pagination setup (Defaults to page 1, 50 items per page)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        // 2. Optional Filtering (Allows frontend to filter by specific tabs)
        const query = {};
        if (req.query.target === 'user') {
            query.user = { $exists: true }; // Only fetch standard user notifications
        } else if (req.query.target === 'tasker') {
            query.tasker = { $exists: true }; // Only fetch tasker notifications
        }
        if (req.query.isRead !== undefined) {
            query.read = req.query.isRead === 'true'; // Filter by read/unread
        }

        // 3. Fetch total count for frontend pagination UI
        const total = await Notification.countDocuments(query);

        // 4. Fetch the actual data with User/Tasker details attached
        const notifications = await Notification.find(query)
            .populate('user', 'firstName lastName emailAddress')     // Grabs User details
            .populate('tasker', 'firstName lastName emailAddress')   // Grabs Tasker details
            .sort({ createdAt: -1 }) // Newest first
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            status: 'success',
            results: notifications.length,
            totalRecords: total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            data: notifications
        });

    } catch (error) {
        Sentry.captureException(error);
        console.error('Fetch all individual notifications error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch user/tasker notifications' });
    }
};