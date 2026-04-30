import webpush from 'web-push';
import * as Sentry from '@sentry/node';
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '../config/envConfig.js';

// Configure web-push with VAPID details
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        VAPID_SUBJECT || 'mailto:support@ngtaskhub.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
    console.log('✅ Web Push configured with VAPID keys');
} else {
    console.warn('⚠️ VAPID keys not set. Web push notifications will not work. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env');
}

/**
 * Send a web push notification to a single subscription object.
 * @param {object} subscription - { endpoint, keys: { p256dh, auth } }
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional data payload for deep linking
 * @returns {Promise<object>} - Web push result
 */
export async function sendWebPushToSubscription(subscription, title, body, data = {}) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.warn('Web push skipped: VAPID keys not configured');
        return null;
    }

    const payload = JSON.stringify({
        title,
        body,
        data,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [100, 50, 100],
    });

    const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
        },
    };

    try {
        const result = await webpush.sendNotification(pushSubscription, payload);
        return result;
    } catch (error) {
        // 410 = subscription expired, 404 = subscription invalid
        if (error.statusCode === 410 || error.statusCode === 404) {
            console.log(`Web push subscription expired/invalid: ${subscription.endpoint.slice(-20)}...`);
            return { expired: true, endpoint: subscription.endpoint };
        }
        console.error('Web push send error:', error.message);
        Sentry.captureException(error);
        throw error;
    }
}

/**
 * Send a web push notification to all subscriptions of a user/tasker.
 * Automatically removes expired subscriptions.
 * @param {object} account - Mongoose User or Tasker document (must have pushSubscriptions)
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional data payload
 */
export async function sendWebPushToAccount(account, title, body, data = {}) {
    if (!account || !account.pushSubscriptions || account.pushSubscriptions.length === 0) {
        return;
    }

    const expiredEndpoints = [];

    for (const sub of account.pushSubscriptions) {
        try {
            await sendWebPushToSubscription(sub, title, body, data);
        } catch (err) {
            // Non-critical: web push failure shouldn't break the flow
            console.error(`Web push failed for ${sub.endpoint.slice(-20)}...:`, err.message);
        }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0 && account._id) {
        try {
            const Model = account.constructor; // Will be User or Tasker model
            await Model.updateOne(
                { _id: account._id },
                { $pull: { pushSubscriptions: { endpoint: { $in: expiredEndpoints } } } }
            );
            console.log(`Cleaned up ${expiredEndpoints.length} expired web push subscription(s)`);
        } catch (cleanupErr) {
            console.error('Failed to clean up expired subscriptions:', cleanupErr.message);
        }
    }
}

/**
 * Send web push to multiple accounts (e.g., all matching taskers).
 * @param {Array} accounts - Array of User/Tasker documents with pushSubscriptions
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional data payload
 */
export async function sendWebPushToAccounts(accounts, title, body, data = {}) {
    for (const account of accounts) {
        try {
            await sendWebPushToAccount(account, title, body, data);
        } catch (err) {
            // Non-critical: continue sending to other accounts
            console.error(`Web push failed for account ${account._id}:`, err.message);
        }
    }
}

/**
 * Get the VAPID public key for client-side subscription.
 * @returns {string} VAPID public key
 */
export function getVapidPublicKey() {
    return VAPID_PUBLIC_KEY;
}