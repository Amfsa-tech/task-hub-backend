import Tasker from '../models/tasker.js';
import User from '../models/user.js';
import { calculateDistance, milesToMeters } from '../utils/locationUtils.js';
import { sendPushToUser, sendPushToMultipleUsers, sendTaskNotification, sendBidNotification } from '../services/onesignal.js';

// Notify taskers about new tasks matching their categories
export const notifyMatchingTaskers = async (task, options = {}) => {
    try {
    const enableRadiusFilter = options.enableRadiusFilter === true;
    const defaultMaxDistanceMiles = typeof options.maxDistanceMiles === 'number' ? options.maxDistanceMiles : 200;
        // Find taskers who have ANY of the task's categories in their categories array
        const matchingTaskers = await Tasker.find({
            categories: { $in: task.categories },
            isActive: true,
            // Do not require email verification for push notifications to avoid missing real-time alerts
            notificationId: { $ne: null } // Only notify taskers with notification IDs
        }).populate('categories', 'name displayName');

        if (matchingTaskers.length === 0) {
            console.log(`No matching taskers to notify. Reasons may include: no taskers with these categories, accounts inactive, or no notificationId set. Categories: ${task.categories.join(', ')}`);
            return;
        }

        console.log(`Found ${matchingTaskers.length} matching taskers for task: ${task.title}`);
        
        // Get category names for logging
        const Category = (await import('../models/category.js')).default;
        const taskCategories = await Category.find({ _id: { $in: task.categories } });
        const categoryNames = taskCategories.map(cat => cat.displayName).join(', ');
        
    // Collect notification IDs for batch sending, with optional radius filtering
        const notificationIds = [];
    let skippedNoNotificationId = 0;
    let skippedOutOfRadius = 0;
        
        for (const tasker of matchingTaskers) {
            if (tasker.notificationId) {
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
                notificationIds.push(tasker.notificationId);
                
                // Find which categories match for this tasker
                const matchingCategoryIds = tasker.categories
                    .filter(taskerCat => task.categories.some(taskCat => taskCat.toString() === taskerCat._id.toString()))
                    .map(cat => cat.displayName)
                    .join(', ');
                    
                console.log(`📧 Notification: Tasker ${tasker.firstName} ${tasker.lastName} (${tasker.emailAddress}) - New "${categoryNames}" task available: "${task.title}" (matches: ${matchingCategoryIds})`);
            } else {
                skippedNoNotificationId++;
            }
        }
        
        // Diagnostics when no one to notify
        if (notificationIds.length === 0) {
            console.log(`No notification recipients. Skipped out-of-radius: ${skippedOutOfRadius}, missing notificationId: ${skippedNoNotificationId}`);
        }

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
                console.error('Error sending push notifications:', pushError);
            }
        }
        
    } catch (error) {
        console.error('Error notifying matching taskers:', error);
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
    }
};

// Notify tasker about bid acceptance
export const notifyTaskerAboutBidAcceptance = async (taskerId, task, bid) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId');
        if (!tasker || !tasker.notificationId) {
            console.log('Tasker not found or has no notification ID');
            return;
        }

        const message = `Congratulations! Your bid of ₦${bid.amount} has been accepted for "${task.title}"`;
        
        await sendTaskNotification(
            tasker.notificationId,
            'Bid Accepted!',
            message,
            task._id.toString()
        );
        
        console.log(`✅ Bid acceptance notification sent to tasker ${tasker.firstName} ${tasker.lastName}`);
    } catch (error) {
        console.error('Error notifying tasker about bid acceptance:', error);
    }
};

// Notify tasker about bid rejection
export const notifyTaskerAboutBidRejection = async (taskerId, task, bid) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId');
        if (!tasker || !tasker.notificationId) {
            console.log('Tasker not found or has no notification ID');
            return;
        }

        const message = `Your bid of ₦${bid.amount} for "${task.title}" was not selected this time`;
        
        await sendTaskNotification(
            tasker.notificationId,
            'Bid Update',
            message,
            task._id.toString()
        );
        
        console.log(`✅ Bid rejection notification sent to tasker ${tasker.firstName} ${tasker.lastName}`);
    } catch (error) {
        console.error('Error notifying tasker about bid rejection:', error);
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
    }
};

// Notify tasker about task cancellation
export const notifyTaskerAboutTaskCancellation = async (taskerId, task) => {
    try {
        const tasker = await Tasker.findById(taskerId).select('firstName lastName notificationId');
        if (!tasker || !tasker.notificationId) {
            console.log('Tasker not found or has no notification ID');
            return;
        }

        const message = `The task "${task.title}" has been cancelled by the user`;
        
        await sendTaskNotification(
            tasker.notificationId,
            'Task Cancelled',
            message,
            task._id.toString()
        );
        
        console.log(`✅ Task cancellation notification sent to tasker ${tasker.firstName} ${tasker.lastName}`);
    } catch (error) {
        console.error('Error notifying tasker about task cancellation:', error);
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
    }
};

// Get taskers by category for analytics
export const getTaskersByCategory = async (categoryId) => {
    try {
        const taskers = await Tasker.find({
            categories: categoryId,
            isActive: true
        }).populate('categories', 'name displayName description');
        
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
            Tasker.countDocuments({ categories: categoryId, isActive: true }),
            Task.countDocuments({ categories: categoryId }),
            Task.find({ categories: categoryId })
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