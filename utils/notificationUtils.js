import * as Sentry from '@sentry/node';
import Tasker from '../models/tasker.js';
import User from '../models/user.js';
import Notification from '../models/notification.js';
import { calculateDistance, milesToMeters } from './locationUtils.js';
import { sendPushToUser, sendPushToMultipleUsers, sendTaskNotification, sendBidNotification } from '../services/onesignal.js';
import { sendWebPushToAccount, sendWebPushToAccounts } from '../services/webPushService.js';
import { sendEmail } from './authUtils.js';
import { newTaskEmailHtml, bidAcceptedEmailHtml, bidRejectedEmailHtml, taskCancelledEmailHtml } from './taskerEmailTemplates.js';

// Notify taskers about new tasks matching their categories
export const notifyMatchingTaskers = async (task, options = {}) => {
    try {
    console.log(`[notify] notifyMatchingTaskers called for task ${task?._id} with options:`, options);
    const enableRadiusFilter = options.enableRadiusFilter === true;
    const defaultMaxDistanceMiles = typeof options.maxDistanceMiles === 'number' ? options.maxDistanceMiles : 200;
        // Find all active taskers matching the task's categories (for both push + email)
        // Build tasker query — scope to university for campus tasks
        const taskerQuery = {
            subCategories: task.subCategory,
            isActive: true,
        };
        if (task.university) {
            taskerQuery.university = task.university;
        }

        const matchingTaskers = await Tasker.find(taskerQuery)
            .populate('subCategories', 'name displayName');

        if (matchingTaskers.length === 0) {
            console.log(`No matching taskers to notify. Reasons may include: no taskers with these categories or accounts inactive. subCategory: ${task.subCategory}`);
            return;
    }
    console.log(`Found ${matchingTaskers.length} matching taskers for task: ${task.title}`);
        
        // Get category names for logging
        const Category = (await import('../models/category.js')).default;
        const taskCategory = await Category.findById(task.subCategory);
        const categoryNames = taskCategory?.displayName || 'Unknown';
        
    // Collect push + email recipients, with optional radius filtering
    const notificationIds = [];
    const emailRecipients = []; // { email, firstName }
    let skippedOutOfRadius = 0;
        
        for (const tasker of matchingTaskers) {
            // If enabled and both have location, filter by distance
            if (enableRadiusFilter &&
                task.location?.latitude != null && task.location?.longitude != null &&
                tasker.location?.latitude != null && tasker.location?.longitude != null) {
                const distanceMeters = calculateDistance(
                    task.location.latitude,
                    task.location.longitude,
                    tasker.location.latitude,
                    tasker.location.longitude
                );
                const withinRadius = distanceMeters <= milesToMeters(defaultMaxDistanceMiles);
                if (!withinRadius) {
                    skippedOutOfRadius++;
                    continue; // skip notifying this tasker due to distance
                }
            }

            // Push notification (only if they have a notificationId)
            if (tasker.notificationId) {
                notificationIds.push(tasker.notificationId);
            }

            // Email (always)
            if (tasker.emailAddress) {
                emailRecipients.push({ email: tasker.emailAddress, firstName: tasker.firstName });
            }
                
            const matchingCategoryIds = tasker.subCategories
                .filter(taskerCat => taskerCat._id.toString() === task.subCategory.toString())
                .map(cat => cat.displayName)
                .join(', ');
                    
            console.log(`📧 Notification: Tasker ${tasker.firstName} ${tasker.lastName} (${tasker.emailAddress}) - New "${categoryNames}" task available: "${task.title}" (matches: ${matchingCategoryIds})`);
        }
    console.log(`[notify] Done building recipients. push=${notificationIds.length}, email=${emailRecipients.length}, skippedOutOfRadius=${skippedOutOfRadius}`);

        // Send batch push notifications
        if (notificationIds.length > 0) {
            try {
                await sendPushToMultipleUsers(
                    notificationIds,
                    `New ${categoryNames} Task Available`,
                    `"${task.title}" - ₦${task.budget}`,
                    {
                        type: 'new_task',
                        taskId: task._id.toString(),
                        categories: categoryNames,
                        action: 'view_task'
                    }
                );
                console.log(`✅ Push notifications sent to ${notificationIds.length} taskers`);
            } catch (pushError) {
                console.error('Batch push failed, will try single sends:', pushError);
                // Fallback: try sending one by one to isolate issues
                let successCount = 0;
                for (const id of notificationIds) {
                    try {
                        await sendPushToUser(
                            id,
                            `New ${categoryNames} Task Available`,
                            `"${task.title}" - ₦${task.budget}`,
                            {
                                type: 'new_task',
                                taskId: task._id.toString(),
                                categories: categoryNames,
                                action: 'view_task'
                            }
                        );
                        successCount++;
                    } catch (singleErr) {
                        console.error(`Single push failed for id ${id}:`, singleErr);
                    }
                }
                console.log(`Single-send fallback complete. Success: ${successCount}/${notificationIds.length}`);
            }
        }

        // Send emails to all matching taskers
        if (emailRecipients.length > 0) {
            let emailSuccess = 0;
            for (const { email, firstName } of emailRecipients) {
                try {
                    const html = newTaskEmailHtml({
                        taskerName: firstName,
                        taskTitle: task.title,
                        categoryNames,
                        budget: task.budget,
                    });
                    await sendEmail({ to: email, subject: `New ${categoryNames} Task: "${task.title}" - TaskHub`, html });
                    emailSuccess++;
                } catch (emailErr) {
                    console.error(`Email send failed for ${email}:`, emailErr.message);
                }
            }
            console.log(`✅ Emails sent to ${emailSuccess}/${emailRecipients.length} taskers`);
        }

        // Send web push notifications to matching taskers
        try {
            const taskersWithPush = matchingTaskers.filter(t => t.pushSubscriptions && t.pushSubscriptions.length > 0);
            if (taskersWithPush.length > 0) {
                await sendWebPushToAccounts(
                    taskersWithPush,
                    `New ${categoryNames} Task Available`,
                    `"${task.title}" - ₦${task.budget}`,
                    { type: 'new_task', taskId: task._id.toString(), categories: categoryNames, action: 'view_task' }
                );
                console.log(`✅ Web push sent to ${taskersWithPush.length} taskers`);
            }
        } catch (webPushErr) {
            console.error('Web push notification error (new task):', webPushErr.message);
        }
        
    } catch (error) {
        console.error('Error notifying matching taskers:', error);
        Sentry.captureException(error);
    }
};

// Notify user about new bid on their task
export const notifyUserAboutNewBid = async (userId, task, bid, tasker) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions');
        if (!user) {
            console.log('User not found');
            return;
        }

        const message = `${tasker.firstName} ${tasker.lastName} placed a bid of ₦${bid.amount} on your task`;

        // OneSignal push
        if (user.notificationId) {
            await sendBidNotification(
                user.notificationId,
                'New Bid Received',
                message,
                bid._id.toString(),
                task._id.toString()
            );
            console.log(`✅ Bid notification sent to user ${user.fullName}`);
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, 'New Bid Received', message, {
                type: 'bid', bidId: bid._id.toString(), taskId: task._id.toString(), action: 'view_bid'
            });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title: 'New Bid Received',
            message,
            type: 'bid',
            metadata: { bidId: bid._id.toString(), taskId: task._id.toString() }
        }).catch(e => console.error('In-app notification error:', e.message));
    } catch (error) {
        console.error('Error notifying user about new bid:', error);
        Sentry.captureException(error);
    }
};

// Notify tasker about bid acceptance
export const notifyTaskerAboutBidAcceptance = async (taskerId, task, bid) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName emailAddress notificationId pushSubscriptions');
        if (!tasker) {
            console.log('Tasker not found');
            return;
        }

        const message = `Congratulations! Your bid of ₦${bid.amount} has been accepted for "${task.title}"`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendTaskNotification(
                tasker.notificationId,
                'Bid Accepted!',
                message,
                task._id.toString()
            );
            console.log(`✅ Bid acceptance push sent to tasker ${tasker.firstName} ${tasker.lastName}`);
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, 'Bid Accepted!', message, {
                type: 'bid_accepted', taskId: task._id.toString(), action: 'view_task'
            });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title: 'Bid Accepted!',
            message,
            type: 'bid',
            metadata: { bidId: bid._id.toString(), taskId: task._id.toString() }
        }).catch(e => console.error('In-app notification error:', e.message));

        // Email
        if (tasker.emailAddress) {
            try {
                const html = bidAcceptedEmailHtml({
                    taskerName: tasker.firstName,
                    taskTitle: task.title,
                    bidAmount: bid.amount,
                });
                await sendEmail({ to: tasker.emailAddress, subject: `Bid Accepted: "${task.title}" - TaskHub`, html });
                console.log(`✅ Bid acceptance email sent to ${tasker.emailAddress}`);
            } catch (emailErr) {
                console.error(`Bid acceptance email failed for ${tasker.emailAddress}:`, emailErr.message);
            }
        }
    } catch (error) {
        console.error('Error notifying tasker about bid acceptance:', error);
        Sentry.captureException(error);
    }
};

// Notify tasker about bid rejection
export const notifyTaskerAboutBidRejection = async (taskerId, task, bid) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName emailAddress notificationId pushSubscriptions');
        if (!tasker) {
            console.log('Tasker not found');
            return;
        }

        const message = `Your bid of ₦${bid.amount} for "${task.title}" was not selected this time`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendTaskNotification(
                tasker.notificationId,
                'Bid Update',
                message,
                task._id.toString()
            );
            console.log(`✅ Bid rejection push sent to tasker ${tasker.firstName} ${tasker.lastName}`);
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, 'Bid Update', message, {
                type: 'bid_rejected', taskId: task._id.toString(), action: 'view_task'
            });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title: 'Bid Update',
            message,
            type: 'bid',
            metadata: { bidId: bid._id.toString(), taskId: task._id.toString() }
        }).catch(e => console.error('In-app notification error:', e.message));

        // Email
        if (tasker.emailAddress) {
            try {
                const html = bidRejectedEmailHtml({
                    taskerName: tasker.firstName,
                    taskTitle: task.title,
                    bidAmount: bid.amount,
                });
                await sendEmail({ to: tasker.emailAddress, subject: `Bid Update: "${task.title}" - TaskHub`, html });
                console.log(`✅ Bid rejection email sent to ${tasker.emailAddress}`);
            } catch (emailErr) {
                console.error(`Bid rejection email failed for ${tasker.emailAddress}:`, emailErr.message);
            }
        }
    } catch (error) {
        console.error('Error notifying tasker about bid rejection:', error);
        Sentry.captureException(error);
    }
};

// Notify user about task completion
export const notifyUserAboutTaskCompletion = async (userId, task, tasker) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions');
        if (!user) {
            console.log('User not found');
            return;
        }

        const message = `${tasker.firstName} ${tasker.lastName} has completed your task "${task.title}"`;

        // OneSignal push
        if (user.notificationId) {
            await sendTaskNotification(
                user.notificationId,
                'Task Completed',
                message,
                task._id.toString()
            );
            console.log(`✅ Task completion notification sent to user ${user.fullName}`);
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, 'Task Completed', message, {
                type: 'task_completed', taskId: task._id.toString(), action: 'view_task'
            });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title: 'Task Completed',
            message,
            type: 'task',
            metadata: { taskId: task._id.toString(), taskerId: tasker._id?.toString() }
        }).catch(e => console.error('In-app notification error:', e.message));
    } catch (error) {
        console.error('Error notifying user about task completion:', error);
        Sentry.captureException(error);
    }
};

// Notify tasker about task cancellation
export const notifyTaskerAboutTaskCancellation = async (taskerId, task) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName emailAddress notificationId pushSubscriptions');
        if (!tasker) {
            console.log('Tasker not found');
            return;
        }

        const message = `The task "${task.title}" has been cancelled by the user`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendTaskNotification(
                tasker.notificationId,
                'Task Cancelled',
                message,
                task._id.toString()
            );
            console.log(`✅ Task cancellation push sent to tasker ${tasker.firstName} ${tasker.lastName}`);
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, 'Task Cancelled', message, {
                type: 'task_cancelled', taskId: task._id.toString(), action: 'view_task'
            });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title: 'Task Cancelled',
            message,
            type: 'task',
            metadata: { taskId: task._id.toString() }
        }).catch(e => console.error('In-app notification error:', e.message));

        // Email
        if (tasker.emailAddress) {
            try {
                const html = taskCancelledEmailHtml({
                    taskerName: tasker.firstName,
                    taskTitle: task.title,
                });
                await sendEmail({ to: tasker.emailAddress, subject: `Task Cancelled: "${task.title}" - TaskHub`, html });
                console.log(`✅ Task cancellation email sent to ${tasker.emailAddress}`);
            } catch (emailErr) {
                console.error(`Task cancellation email failed for ${tasker.emailAddress}:`, emailErr.message);
            }
        }
    } catch (error) {
        console.error('Error notifying tasker about task cancellation:', error);
        Sentry.captureException(error);
    }
};

// Send welcome notification to new user
export const sendWelcomeNotificationToUser = async (userId) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions');
        if (!user) {
            console.log('User not found');
            return;
        }

        const title = `Welcome to TaskHub, ${user.fullName}!`;
        const body = 'Start posting tasks and get things done quickly and efficiently.';

        // OneSignal push
        if (user.notificationId) {
            await sendPushToUser(
                user.notificationId,
                title,
                body,
                { type: 'welcome', action: 'open_app' }
            );
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, title, body, { type: 'welcome', action: 'open_app' });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title,
            message: body,
            type: 'welcome'
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Welcome notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error sending welcome notification to user:', error);
        Sentry.captureException(error);
    }
};

// Send welcome notification to new tasker
export const sendWelcomeNotificationToTasker = async (taskerId) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions');
        if (!tasker) {
            console.log('Tasker not found');
            return;
        }

        const title = `Welcome to TaskHub, ${tasker.firstName}!`;
        const body = 'Start browsing available tasks and earn money by helping others.';

        // OneSignal push
        if (tasker.notificationId) {
            await sendPushToUser(
                tasker.notificationId,
                title,
                body,
                { type: 'welcome', action: 'browse_tasks' }
            );
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, body, { type: 'welcome', action: 'browse_tasks' });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title,
            message: body,
            type: 'welcome'
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Welcome notification sent to tasker ${tasker.firstName} ${tasker.lastName}`);
    } catch (error) {
        console.error('Error sending welcome notification to tasker:', error);
        Sentry.captureException(error);
    }
};

// Get taskers by category for analytics
export const getTaskersByCategory = async (categoryId) => {
    try {
        const taskers = await Tasker.find({
            subCategories: categoryId,
            isActive: true
        }).populate('subCategories', 'name displayName description');
        
        return taskers;
    } catch (error) {
        console.error('Error getting taskers by category:', error);
        throw error;
    }
};

// Get category match statistics
export const getCategoryMatchStats = async (categoryId) => {
    try {
        const Task = (await import('../models/task.js')).default;
        
        const [taskersCount, tasksCount, recentTasks] = await Promise.all([
            Tasker.countDocuments({ subCategories: categoryId, isActive: true }),
            Task.countDocuments({ subCategory: categoryId }),
            Task.find({ subCategory: categoryId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('title createdAt status budget')
                .populate('user', 'fullName')
        ]);
        
        return {
            categoryId,
            availableTaskers: taskersCount,
            totalTasks: tasksCount,
            recentTasks
        };
    } catch (error) {
        console.error('Error getting category match stats:', error);
        throw error;
    }
}; 

// Notify recipient about a new chat message
export const notifyOnNewChatMessage = async (recipientType, recipientId, conversationId, preview) => {
    try {
        let notificationId = null;
        let account = null;
        if (recipientType === 'user') {
            const user = await User.findById(recipientId).select('notificationId pushSubscriptions fullName');
            if (!user) return;
            account = user;
            notificationId = user.notificationId;
        } else {
            const tasker = await Tasker.findById(recipientId).select('notificationId pushSubscriptions firstName');
            if (!tasker) return;
            account = tasker;
            notificationId = tasker.notificationId;
        }

        const title = 'New message';
        const body = preview || 'You have a new chat message';
        const data = { type: 'chat', conversationId: conversationId?.toString(), action: 'open_conversation' };

        // OneSignal push
        if (notificationId) {
            await sendPushToUser(notificationId, title, body, data);
        }

        // Web push
        if (account && account.pushSubscriptions && account.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(account, title, body, data);
        }

        // In-app notification
        const notifDoc = {
            title,
            message: body,
            type: 'chat',
            metadata: { conversationId: conversationId?.toString() }
        };
        if (recipientType === 'user') {
            notifDoc.user = recipientId;
        } else {
            notifDoc.tasker = recipientId;
        }
        await Notification.create(notifDoc).catch(e => console.error('In-app notification error:', e.message));
    } catch (error) {
        console.error('Error sending chat message notification:', error);
        Sentry.captureException(error);
    }
};

// ============================================================
// NEW NOTIFICATION FUNCTIONS — FILLING IDENTIFIED GAPS
// ============================================================

/**
 * Notify user that their wallet has been funded (Paystack or Stellar).
 * @param {string} userId - User ID
 * @param {number} amount - Amount credited in Naira
 * @param {string} method - 'paystack' or 'stellar'
 */
export const notifyWalletFunded = async (userId, amount, method = 'paystack') => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions emailAddress');
        if (!user) { console.log('User not found for wallet funding notification'); return; }

        const title = 'Wallet Funded 💰';
        const message = `₦${amount.toLocaleString()} has been added to your wallet via ${method === 'stellar' ? 'crypto deposit' : 'card payment'}.`;

        // OneSignal push
        if (user.notificationId) {
            await sendPushToUser(user.notificationId, title, message, { type: 'wallet', action: 'view_wallet' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, title, message, { type: 'wallet', action: 'view_wallet' });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title,
            message,
            type: 'wallet',
            metadata: { amount, method }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Wallet funded notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error notifying user about wallet funding:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify tasker that their wallet has been funded (Stellar deposit).
 * @param {string} taskerId - Tasker ID
 * @param {number} amount - Amount credited in Naira
 */
export const notifyTaskerWalletFunded = async (taskerId, amount) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions emailAddress');
        if (!tasker) { console.log('Tasker not found for wallet funding notification'); return; }

        const title = 'Wallet Funded 💰';
        const message = `₦${amount.toLocaleString()} has been added to your wallet via crypto deposit.`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendPushToUser(tasker.notificationId, title, message, { type: 'wallet', action: 'view_wallet' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, message, { type: 'wallet', action: 'view_wallet' });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title,
            message,
            type: 'wallet',
            metadata: { amount, method: 'stellar' }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Wallet funded notification sent to tasker ${tasker.firstName}`);
    } catch (error) {
        console.error('Error notifying tasker about wallet funding:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify user that escrow has been held from their wallet.
 * @param {string} userId - User ID
 * @param {object} task - Task document
 * @param {number} amount - Escrow amount
 */
export const notifyEscrowHeld = async (userId, task, amount) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions');
        if (!user) { console.log('User not found for escrow notification'); return; }

        const title = 'Payment Held in Escrow 🔒';
        const message = `₦${amount.toLocaleString()} has been held in escrow for task "${task.title}". It will be released when the task is completed.`;

        // OneSignal push
        if (user.notificationId) {
            await sendPushToUser(user.notificationId, title, message, { type: 'escrow', taskId: task._id.toString(), action: 'view_task' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, title, message, { type: 'escrow', taskId: task._id.toString(), action: 'view_task' });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title,
            message,
            type: 'escrow',
            metadata: { taskId: task._id.toString(), amount }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Escrow held notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error notifying user about escrow hold:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify user that escrow has been refunded (task cancelled).
 * @param {string} userId - User ID
 * @param {object} task - Task document
 * @param {number} amount - Refund amount
 */
export const notifyEscrowRefunded = async (userId, task, amount) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions');
        if (!user) { console.log('User not found for escrow refund notification'); return; }

        const title = 'Escrow Refunded 💸';
        const message = `₦${amount.toLocaleString()} has been refunded to your wallet for the cancelled task "${task.title}".`;

        // OneSignal push
        if (user.notificationId) {
            await sendPushToUser(user.notificationId, title, message, { type: 'escrow_refund', taskId: task._id.toString(), action: 'view_wallet' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, title, message, { type: 'escrow_refund', taskId: task._id.toString(), action: 'view_wallet' });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title,
            message,
            type: 'escrow',
            metadata: { taskId: task._id.toString(), amount }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Escrow refund notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error notifying user about escrow refund:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify user that a tasker has started their task (assigned → in-progress).
 * Includes the completion code.
 * @param {string} userId - User ID
 * @param {object} task - Task document
 * @param {string} completionCode - The 6-digit code
 * @param {object} tasker - Tasker document (firstName, lastName)
 */
export const notifyUserTaskStarted = async (userId, task, completionCode, tasker) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions');
        if (!user) { console.log('User not found for task started notification'); return; }

        const title = 'Task Started 🚀';
        const message = `${tasker.firstName} ${tasker.lastName} has started working on "${task.title}". Your completion code is: ${completionCode}`;

        // OneSignal push
        if (user.notificationId) {
            await sendPushToUser(user.notificationId, title, message, { type: 'task_started', taskId: task._id.toString(), completionCode, action: 'view_task' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, title, message, { type: 'task_started', taskId: task._id.toString(), completionCode, action: 'view_task' });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title,
            message,
            type: 'task',
            metadata: { taskId: task._id.toString(), completionCode }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Task started notification sent to user ${user.fullName} with completion code`);
    } catch (error) {
        console.error('Error notifying user about task start:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify tasker that escrow has been released (they earned money).
 * @param {string} taskerId - Tasker ID
 * @param {object} task - Task document
 * @param {number} payoutAmount - Amount credited to tasker wallet
 */
export const notifyTaskerPayoutReceived = async (taskerId, task, payoutAmount) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions emailAddress');
        if (!tasker) { console.log('Tasker not found for payout notification'); return; }

        const title = 'Payout Received! 💰';
        const message = `₦${payoutAmount.toLocaleString()} has been credited to your wallet for completing "${task.title}".`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendPushToUser(tasker.notificationId, title, message, { type: 'payout', taskId: task._id.toString(), action: 'view_wallet' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, message, { type: 'payout', taskId: task._id.toString(), action: 'view_wallet' });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title,
            message,
            type: 'payout',
            metadata: { taskId: task._id.toString(), amount: payoutAmount }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Payout notification sent to tasker ${tasker.firstName}`);
    } catch (error) {
        console.error('Error notifying tasker about payout:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify tasker that their withdrawal request has been submitted.
 * @param {string} taskerId - Tasker ID
 * @param {number} amount - Withdrawal amount
 * @param {string} payoutMethod - 'bank_transfer' or 'stellar_crypto'
 */
export const notifyWithdrawalRequested = async (taskerId, amount, payoutMethod) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions');
        if (!tasker) { console.log('Tasker not found for withdrawal request notification'); return; }

        const title = 'Withdrawal Request Submitted 📋';
        const methodLabel = payoutMethod === 'stellar_crypto' ? 'crypto wallet' : 'bank account';
        const message = `Your withdrawal request of ₦${amount.toLocaleString()} to your ${methodLabel} has been submitted and is awaiting approval.`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendPushToUser(tasker.notificationId, title, message, { type: 'withdrawal', action: 'view_wallet' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, message, { type: 'withdrawal', action: 'view_wallet' });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title,
            message,
            type: 'withdrawal',
            metadata: { amount, payoutMethod }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Withdrawal request notification sent to tasker ${tasker.firstName}`);
    } catch (error) {
        console.error('Error notifying tasker about withdrawal request:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify tasker that their withdrawal was rejected and funds returned.
 * @param {string} taskerId - Tasker ID
 * @param {number} amount - Withdrawal amount
 * @param {string} reason - Rejection reason
 */
export const notifyWithdrawalRejected = async (taskerId, amount, reason) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions emailAddress');
        if (!tasker) { console.log('Tasker not found for withdrawal rejection notification'); return; }

        const title = 'Withdrawal Update ⚠️';
        const message = `Your withdrawal of ₦${amount.toLocaleString()} was not approved. Reason: ${reason}. The funds have been returned to your wallet.`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendPushToUser(tasker.notificationId, title, message, { type: 'withdrawal', action: 'view_wallet' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, message, { type: 'withdrawal', action: 'view_wallet' });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title,
            message,
            type: 'withdrawal',
            metadata: { amount, reason }
        }).catch(e => console.error('In-app notification error:', e.message));

        // Email
        if (tasker.emailAddress) {
            try {
                const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
                    <h2 style="color:#e53e3e;">Withdrawal Update</h2>
                    <p>Hi ${tasker.firstName},</p>
                    <p>Your withdrawal request of <b>₦${amount.toLocaleString()}</b> was not approved.</p>
                    <p><b>Reason:</b> ${reason}</p>
                    <p>The funds have been returned to your TaskHub wallet.</p>
                </div>`;
                await sendEmail({ to: tasker.emailAddress, subject: 'Withdrawal Update - TaskHub', html });
            } catch (emailErr) {
                console.error(`Withdrawal rejection email failed for ${tasker.emailAddress}:`, emailErr.message);
            }
        }

        console.log(`✅ Withdrawal rejection notification sent to tasker ${tasker.firstName}`);
    } catch (error) {
        console.error('Error notifying tasker about withdrawal rejection:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify tasker that their bank withdrawal has been completed (money sent).
 * @param {string} taskerId - Tasker ID
 * @param {number} amount - Withdrawal amount
 * @param {string} bankName - Bank name
 */
export const notifyWithdrawalCompleted = async (taskerId, amount, bankName) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions emailAddress');
        if (!tasker) { console.log('Tasker not found for withdrawal completion notification'); return; }

        const title = 'Withdrawal Completed ✅';
        const message = `₦${amount.toLocaleString()} has been sent to your ${bankName || 'bank'} account. You should receive it within 24 hours.`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendPushToUser(tasker.notificationId, title, message, { type: 'withdrawal', action: 'view_wallet' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, message, { type: 'withdrawal', action: 'view_wallet' });
        }

        // In-app notification (already exists for crypto, adding for bank)
        await Notification.create({
            tasker: taskerId,
            title,
            message,
            type: 'payout',
            metadata: { amount, bankName }
        }).catch(e => console.error('In-app notification error:', e.message));

        // Email
        if (tasker.emailAddress) {
            try {
                const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
                    <h2 style="color:#38a169;">Withdrawal Completed! 🎉</h2>
                    <p>Hi ${tasker.firstName},</p>
                    <p>Your withdrawal of <b>₦${amount.toLocaleString()}</b> has been sent to your <b>${bankName || 'bank'}</b> account.</p>
                    <p>You should receive the funds within 24 hours.</p>
                </div>`;
                await sendEmail({ to: tasker.emailAddress, subject: 'Withdrawal Completed - TaskHub', html });
            } catch (emailErr) {
                console.error(`Withdrawal completion email failed for ${tasker.emailAddress}:`, emailErr.message);
            }
        }

        console.log(`✅ Withdrawal completion notification sent to tasker ${tasker.firstName}`);
    } catch (error) {
        console.error('Error notifying tasker about withdrawal completion:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify tasker that a task they bid on was cancelled (open task with bids).
 * @param {string} taskerId - Tasker ID
 * @param {object} task - Task document
 */
export const notifyTaskerAboutOpenTaskCancellation = async (taskerId, task) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions');
        if (!tasker) { console.log('Tasker not found for open task cancellation notification'); return; }

        const title = 'Task Cancelled';
        const message = `The task "${task.title}" that you applied for has been cancelled by the user.`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendTaskNotification(tasker.notificationId, title, message, task._id.toString()).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, message, { type: 'task_cancelled', taskId: task._id.toString(), action: 'view_task' });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title,
            message,
            type: 'task',
            metadata: { taskId: task._id.toString() }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Open task cancellation notification sent to tasker ${tasker.firstName}`);
    } catch (error) {
        console.error('Error notifying tasker about open task cancellation:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify tasker that a task they bid on was updated.
 * @param {string} taskerId - Tasker ID
 * @param {object} task - Updated task document
 * @param {string[]} updatedFields - List of changed field names
 */
export const notifyTaskerAboutTaskUpdate = async (taskerId, task, updatedFields) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions');
        if (!tasker) { console.log('Tasker not found for task update notification'); return; }

        const title = 'Task Updated';
        const fieldsStr = updatedFields.join(', ');
        const message = `The task "${task.title}" has been updated. Changes: ${fieldsStr}.`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendTaskNotification(tasker.notificationId, title, message, task._id.toString()).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, message, { type: 'task_updated', taskId: task._id.toString(), action: 'view_task' });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title,
            message,
            type: 'task',
            metadata: { taskId: task._id.toString(), updatedFields }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Task update notification sent to tasker ${tasker.firstName}`);
    } catch (error) {
        console.error('Error notifying tasker about task update:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify user that a tasker withdrew their bid.
 * @param {string} userId - User ID
 * @param {object} task - Task document
 * @param {object} tasker - Tasker who withdrew
 */
export const notifyUserAboutBidWithdrawal = async (userId, task, tasker) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions');
        if (!user) { console.log('User not found for bid withdrawal notification'); return; }

        const title = 'Bid Withdrawn';
        const message = `${tasker.firstName} ${tasker.lastName} withdrew their bid on your task "${task.title}".`;

        // OneSignal push
        if (user.notificationId) {
            await sendPushToUser(user.notificationId, title, message, { type: 'bid', taskId: task._id.toString(), action: 'view_task' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, title, message, { type: 'bid', taskId: task._id.toString(), action: 'view_task' });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title,
            message,
            type: 'bid',
            metadata: { taskId: task._id.toString(), taskerId: tasker._id?.toString() }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Bid withdrawal notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error notifying user about bid withdrawal:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify user that a tasker has been assigned to their task.
 * @param {string} userId - User ID
 * @param {object} task - Task document
 * @param {object} tasker - Assigned tasker
 */
export const notifyUserAboutTaskAssignment = async (userId, task, tasker) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId pushSubscriptions');
        if (!user) { console.log('User not found for task assignment notification'); return; }

        const title = 'Tasker Assigned ✅';
        const message = `${tasker.firstName} ${tasker.lastName} has been assigned to your task "${task.title}". You can now chat with them.`;

        // OneSignal push
        if (user.notificationId) {
            await sendPushToUser(user.notificationId, title, message, { type: 'task_assigned', taskId: task._id.toString(), action: 'view_task' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(user, title, message, { type: 'task_assigned', taskId: task._id.toString(), action: 'view_task' });
        }

        // In-app notification
        await Notification.create({
            user: userId,
            title,
            message,
            type: 'task',
            metadata: { taskId: task._id.toString(), taskerId: tasker._id?.toString() }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ Task assignment notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error notifying user about task assignment:', error);
        Sentry.captureException(error);
    }
};

/**
 * Notify tasker that they received a new rating/review.
 * @param {string} taskerId - Tasker ID
 * @param {number} rating - Rating value (1-5)
 * @param {string} reviewText - Optional review text
 */
export const notifyTaskerAboutNewRating = async (taskerId, rating, reviewText) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId pushSubscriptions');
        if (!tasker) { console.log('Tasker not found for new rating notification'); return; }

        const stars = '⭐'.repeat(rating);
        const title = 'New Rating Received!';
        const preview = reviewText ? reviewText.substring(0, 100) + (reviewText.length > 100 ? '...' : '') : 'No comment provided';
        const message = `You received a ${rating}-star rating! ${preview}`;

        // OneSignal push
        if (tasker.notificationId) {
            await sendPushToUser(tasker.notificationId, title, message, { type: 'rating', rating, action: 'view_reviews' }).catch(e => console.error('OneSignal error:', e.message));
        }

        // Web push
        if (tasker.pushSubscriptions && tasker.pushSubscriptions.length > 0) {
            await sendWebPushToAccount(tasker, title, message, { type: 'rating', rating, action: 'view_reviews' });
        }

        // In-app notification
        await Notification.create({
            tasker: taskerId,
            title,
            message,
            type: 'rating',
            metadata: { rating, preview }
        }).catch(e => console.error('In-app notification error:', e.message));

        console.log(`✅ New rating notification sent to tasker ${tasker.firstName}`);
    } catch (error) {
        console.error('Error notifying tasker about new rating:', error);
        Sentry.captureException(error);
    }
};