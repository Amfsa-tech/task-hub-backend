
import fetch from 'node-fetch';
import { ONESIGNAL_APP_ID, ONESIGNAL_REST_KEY } from '../config/envConfig.js';

/**
 * Send a push notification to a single user (right after signup)
 * @param {string} playerId   – the OneSignal player_id / subscription_id you got from the Flutter SDK
 * @param {string} heading    – e.g. "Welcome!"
 * @param {string} message    – e.g. "Thanks for signing up, John"
 */
export async function sendWelcomePush(playerId, heading, message) {
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    include_subscription_ids: [playerId], // <= docs: send to 1 specific device
    contents: { en: message },
    headings: { en: heading },
    name: 'welcome_push',                 // optional, shows in OneSignal dashboard
    isAndroid: true,
    isIos: true
  };

  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${ONESIGNAL_REST_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`OneSignal API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Welcome push notification sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending welcome push notification:', error);
    throw error;
  }
}

/**
 * Send a push notification to a single user by notification ID
 * @param {string} notificationId - The user's notification ID
 * @param {string} heading - Notification title
 * @param {string} message - Notification body
 * @param {object} data - Optional data payload
 */
export async function sendPushToUser(notificationId, heading, message, data = {}) {
  if (!notificationId) {
    throw new Error('Notification ID is required');
  }

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    include_subscription_ids: [notificationId],
    contents: { en: message },
    headings: { en: heading },
    data: data,
    isAndroid: true,
    isIos: true
  };

  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${ONESIGNAL_REST_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`OneSignal API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Push notification sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

/**
 * Send push notifications to multiple users
 * @param {string[]} notificationIds - Array of notification IDs
 * @param {string} heading - Notification title
 * @param {string} message - Notification body
 * @param {object} data - Optional data payload
 */
export async function sendPushToMultipleUsers(notificationIds, heading, message, data = {}) {
  if (!notificationIds || notificationIds.length === 0) {
    throw new Error('At least one notification ID is required');
  }

  // Filter out null/undefined notification IDs
  const validNotificationIds = notificationIds.filter(id => id && typeof id === 'string');
  
  if (validNotificationIds.length === 0) {
    throw new Error('No valid notification IDs provided');
  }

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    include_subscription_ids: validNotificationIds,
    contents: { en: message },
    headings: { en: heading },
    data: data,
    isAndroid: true,
    isIos: true
  };

  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${ONESIGNAL_REST_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`OneSignal API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Push notification sent to ${validNotificationIds.length} users:`, result);
    return result;
  } catch (error) {
    console.error('Error sending push notifications:', error);
    throw error;
  }
}

/**
 * Send task-related notification to a user
 * @param {string} notificationId - User's notification ID
 * @param {string} taskTitle - Task title
 * @param {string} message - Notification message
 * @param {string} taskId - Task ID for deep linking
 */
export async function sendTaskNotification(notificationId, taskTitle, message, taskId) {
  const data = {
    type: 'task',
    taskId: taskId,
    action: 'view_task'
  };

  return sendPushToUser(notificationId, taskTitle, message, data);
}

/**
 * Send bid-related notification to a user
 * @param {string} notificationId - User's notification ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} bidId - Bid ID for deep linking
 * @param {string} taskId - Task ID for context
 */
export async function sendBidNotification(notificationId, title, message, bidId, taskId) {
  const data = {
    type: 'bid',
    bidId: bidId,
    taskId: taskId,
    action: 'view_bid'
  };

  return sendPushToUser(notificationId, title, message, data);
}
