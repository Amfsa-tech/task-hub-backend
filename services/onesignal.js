import fetch from 'node-fetch';
import * as Sentry from '@sentry/node';
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
    include_subscription_ids: [playerId],
    contents: { en: message },
    headings: { en: heading },
    name: 'welcome_push',                 // optional, shows in OneSignal dashboard
  };

  try {
  const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${ONESIGNAL_REST_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch (textErr) {
        console.error('Failed to read OneSignal error response body:', textErr);
      }
      throw new Error(`OneSignal API error: ${response.status} ${response.statusText} - ${bodyText}`);
    }

    const result = await response.json();
    console.log('Welcome push notification sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending welcome push notification:', error);
    Sentry.captureException(error);
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
export async function sendPushToUser(notificationId, heading, message, data = {}, dbNotificationId = null) {
  if (!notificationId) {
    throw new Error('Notification ID is required');
  }

  // ADDED: Merge the tracking ID into the hidden data payload
  const mergedData = { ...data };
  if (dbNotificationId) {
      mergedData.notificationId = dbNotificationId.toString();
  }

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_subscription_ids: [notificationId],
    contents: { en: message },
    headings: { en: heading },
    data: mergedData // Use the merged data here!
  };

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${ONESIGNAL_REST_KEY}`
        },
        body: JSON.stringify(payload)
      });

    // ... rest of your error handling stays exactly the same
    if (!response.ok) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch (e) {}
      throw new Error(`OneSignal API error: ${response.status} ${response.statusText} - ${bodyText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error sending push notification:', error);
    Sentry.captureException(error);
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
export async function sendPushToMultipleUsers(notificationIds, heading, message, data = {}, dbNotificationId = null) {
  if (!notificationIds || notificationIds.length === 0) {
    throw new Error('At least one notification ID is required');
  }

  const validNotificationIds = notificationIds.filter(id => id && typeof id === 'string');
  if (validNotificationIds.length === 0) {
    throw new Error('No valid notification IDs provided');
  }

  // ADDED: Merge the tracking ID into the hidden data payload
  const mergedData = { ...data };
  if (dbNotificationId) {
      mergedData.notificationId = dbNotificationId.toString();
  }

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_subscription_ids: validNotificationIds,
    contents: { en: message },
    headings: { en: heading },
    data: mergedData // Use the merged data here!
  };

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${ONESIGNAL_REST_KEY}`
        },
        body: JSON.stringify(payload)
      });

    // ... rest of your error handling stays exactly the same
    if (!response.ok) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch (e) {}
      throw new Error(`OneSignal API error: ${response.status} ${response.statusText} - ${bodyText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error sending push notifications:', error);
    Sentry.captureException(error);
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

export async function sendKycNotification(notificationId, status, reason = '') {
  if (!notificationId) return;

  const heading =
    status === 'approved'
      ? 'KYC Approved'
      : 'KYC Rejected';

  const message =
    status === 'approved'
      ? 'Your identity verification was approved. You can now withdraw funds.'
      : `Your KYC was rejected. Reason: ${reason}`;

  return sendPushToUser(notificationId, heading, message, {
    type: 'kyc',
    status
  });
}

