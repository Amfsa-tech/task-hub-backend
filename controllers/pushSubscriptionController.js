import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import * as Sentry from '@sentry/node';

/**
 * POST /api/push/subscribe
 * Register a web push subscription for the logged-in user or tasker.
 * Body: { subscription: { endpoint, keys: { p256dh, auth } } }
 */
export const subscribePush = async (req, res) => {
    try {
        const { subscription } = req.body;

        if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid subscription object. Required: { endpoint, keys: { p256dh, auth } }'
            });
        }

        const Model = req.userType === 'tasker' ? Tasker : User;
        const account = await Model.findById(req.user._id);

        if (!account) {
            return res.status(404).json({ status: 'error', message: 'Account not found' });
        }

        // Check if this endpoint is already registered
        const existingIndex = account.pushSubscriptions.findIndex(
            sub => sub.endpoint === subscription.endpoint
        );

        if (existingIndex !== -1) {
            // Update existing subscription keys in case they changed
            account.pushSubscriptions[existingIndex].keys = subscription.keys;
            await account.save();
            return res.json({
                status: 'success',
                message: 'Push subscription updated'
            });
        }

        // Add new subscription (limit to 5 per account to prevent bloat)
        if (account.pushSubscriptions.length >= 5) {
            // Remove the oldest subscription
            account.pushSubscriptions.shift();
        }

        account.pushSubscriptions.push({
            endpoint: subscription.endpoint,
            keys: subscription.keys
        });
        await account.save();

        return res.json({
            status: 'success',
            message: 'Push subscription registered'
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Subscribe push error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to register push subscription' });
    }
};

/**
 * POST /api/push/unsubscribe
 * Remove a web push subscription for the logged-in user or tasker.
 * Body: { endpoint: "..." }
 */
export const unsubscribePush = async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({
                status: 'error',
                message: 'Endpoint is required'
            });
        }

        const Model = req.userType === 'tasker' ? Tasker : User;

        const result = await Model.updateOne(
            { _id: req.user._id },
            { $pull: { pushSubscriptions: { endpoint } } }
        );

        return res.json({
            status: 'success',
            message: 'Push subscription removed',
            removed: result.modifiedCount > 0
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Unsubscribe push error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to remove push subscription' });
    }
};

/**
 * GET /api/push/vapid-public-key
 * Return the VAPID public key for client-side push subscription.
 * This is a public endpoint — no auth required.
 */
export const getVapidPublicKey = async (req, res) => {
    try {
        const { VAPID_PUBLIC_KEY } = await import('../config/envConfig.js');
        if (!VAPID_PUBLIC_KEY) {
            return res.status(503).json({ status: 'error', message: 'Web push not configured' });
        }
        return res.json({ status: 'success', publicKey: VAPID_PUBLIC_KEY });
    } catch (error) {
        Sentry.captureException(error);
        return res.status(500).json({ status: 'error', message: 'Failed to get public key' });
    }
};