import crypto from 'crypto';
import { PAYSTACK_SECRET_KEY } from '../config/envConfig.js';

/**
 * Middleware to verify the Paystack webhook signature.
 * Paystack signs webhooks with HMAC SHA-512 using the secret key over the raw request body.
 *
 * IMPORTANT: This middleware must receive the raw request body (Buffer), not parsed JSON.
 * The route using this middleware must be registered with express.raw() instead of express.json().
 */
export const verifyPaystackSignature = (req, res, next) => {
    if (!PAYSTACK_SECRET_KEY) {
        console.error('[Paystack Webhook] No secret key configured');
        return res.status(500).json({ success: false, message: 'Paystack not configured' });
    }

    const signature = req.headers['x-paystack-signature'];

    if (!signature) {
        console.error('[Paystack Webhook] Missing x-paystack-signature header');
        return res.status(401).json({ success: false, message: 'Missing signature' });
    }

    const rawBody = req.body;

    // req.body should be a Buffer when express.raw() is used on this route
    const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;

    const expectedSignature = crypto
        .createHmac('sha512', PAYSTACK_SECRET_KEY)
        .update(bodyString)
        .digest('hex');

    if (signature !== expectedSignature) {
        console.error('[Paystack Webhook] Invalid signature');
        return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    // Parse the raw body into JSON for downstream handlers
    if (Buffer.isBuffer(req.body)) {
        try {
            req.body = JSON.parse(bodyString);
        } catch {
            return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
        }
    }

    next();
};
