import * as Sentry from '@sentry/node';
import Tasker from '../models/tasker.js';
import User from '../models/user.js';
import { calculateDistance, milesToMeters } from './locationUtils.js';
import { sendPushToUser, sendPushToMultipleUsers, sendTaskNotification, sendBidNotification } from '../services/onesignal.js';
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
        
    } catch (error) {
        console.error('Error notifying matching taskers:', error);
        Sentry.captureException(error);
    }
};

// Notify user about new bid on their task
export const notifyUserAboutNewBid = async (userId, task, bid, tasker) => {
    try {
        const user = await User.findById(userId).select('fullName notificationId');
        if (!user || !user.notificationId) {
            console.log('User not found or has no notification ID');
            return;
        }

        const message = `${tasker.firstName} ${tasker.lastName} placed a bid of ₦${bid.amount} on your task`;
        
        await sendBidNotification(
            user.notificationId,
            'New Bid Received',
            message,
            bid._id.toString(),
            task._id.toString()
        );
        
        console.log(`✅ Bid notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error notifying user about new bid:', error);
        Sentry.captureException(error);
    }
};

// Notify tasker about bid acceptance
export const notifyTaskerAboutBidAcceptance = async (taskerId, task, bid) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName emailAddress notificationId');
        if (!tasker) {
            console.log('Tasker not found');
            return;
        }

        const message = `Congratulations! Your bid of ₦${bid.amount} has been accepted for "${task.title}"`;

        // Push notification
        if (tasker.notificationId) {
            await sendTaskNotification(
                tasker.notificationId,
                'Bid Accepted!',
                message,
                task._id.toString()
            );
            console.log(`✅ Bid acceptance push sent to tasker ${tasker.firstName} ${tasker.lastName}`);
        }

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
        const tasker = await Tasker.findById(taskerId).select('firstName lastName emailAddress notificationId');
        if (!tasker) {
            console.log('Tasker not found');
            return;
        }

        const message = `Your bid of ₦${bid.amount} for "${task.title}" was not selected this time`;

        // Push notification
        if (tasker.notificationId) {
            await sendTaskNotification(
                tasker.notificationId,
                'Bid Update',
                message,
                task._id.toString()
            );
            console.log(`✅ Bid rejection push sent to tasker ${tasker.firstName} ${tasker.lastName}`);
        }

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
        const user = await User.findById(userId).select('fullName notificationId');
        if (!user || !user.notificationId) {
            console.log('User not found or has no notification ID');
            return;
        }

        const message = `${tasker.firstName} ${tasker.lastName} has completed your task "${task.title}"`;
        
        await sendTaskNotification(
            user.notificationId,
            'Task Completed',
            message,
            task._id.toString()
        );
        
        console.log(`✅ Task completion notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error notifying user about task completion:', error);
        Sentry.captureException(error);
    }
};

// Notify tasker about task cancellation
export const notifyTaskerAboutTaskCancellation = async (taskerId, task) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName emailAddress notificationId');
        if (!tasker) {
            console.log('Tasker not found');
            return;
        }

        const message = `The task "${task.title}" has been cancelled by the user`;

        // Push notification
        if (tasker.notificationId) {
            await sendTaskNotification(
                tasker.notificationId,
                'Task Cancelled',
                message,
                task._id.toString()
            );
            console.log(`✅ Task cancellation push sent to tasker ${tasker.firstName} ${tasker.lastName}`);
        }

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
        const user = await User.findById(userId).select('fullName notificationId');
        if (!user || !user.notificationId) {
            console.log('User not found or has no notification ID');
            return;
        }

        await sendPushToUser(
            user.notificationId,
            `Welcome to TaskHub, ${user.fullName}!`,
            'Start posting tasks and get things done quickly and efficiently.',
            {
                type: 'welcome',
                action: 'open_app'
            }
        );
        
        console.log(`✅ Welcome notification sent to user ${user.fullName}`);
    } catch (error) {
        console.error('Error sending welcome notification to user:', error);
        Sentry.captureException(error);
    }
};

// Send welcome notification to new tasker
export const sendWelcomeNotificationToTasker = async (taskerId) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId');
        if (!tasker || !tasker.notificationId) {
            console.log('Tasker not found or has no notification ID');
            return;
        }

        await sendPushToUser(
            tasker.notificationId,
            `Welcome to TaskHub, ${tasker.firstName}!`,
            'Start browsing available tasks and earn money by helping others.',
            {
                type: 'welcome',
                action: 'browse_tasks'
            }
        );
        
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
        if (recipientType === 'user') {
            const user = await User.findById(recipientId).select('notificationId fullName');
            if (!user || !user.notificationId) return;
            notificationId = user.notificationId;
        } else {
            const tasker = await Tasker.findById(recipientId).select('notificationId firstName');
            if (!tasker || !tasker.notificationId) return;
            notificationId = tasker.notificationId;
        }

        await sendPushToUser(
            notificationId,
            'New message',
            preview || 'You have a new chat message',
            {
                type: 'chat',
                conversationId: conversationId?.toString(),
                action: 'open_conversation'
            }
        );
    } catch (error) {
        console.error('Error sending chat message notification:', error);
        Sentry.captureException(error);
    }
};