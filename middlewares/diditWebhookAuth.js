import crypto from 'crypto';
import { DIDIT_WEBHOOK_SECRET } from '../config/envConfig.js';

/**
 * Middleware to verify the Didit webhook signature.
 * Ensures the request actually came from Didit and was not tampered with.
 *
 * If DIDIT_WEBHOOK_SECRET is not configured, verification is skipped
 * (useful during development).
 */
export const verifyDiditSignature = (req, res, next) => {
  if (!DIDIT_WEBHOOK_SECRET || DIDIT_WEBHOOK_SECRET === 'your-didit-webhook-secret') {
    console.warn('[Didit Auth] No webhook secret configured — skipping signature verification');
    return next();
  }

  const signature =
    req.headers['x-didit-signature'] ||
    req.headers['x-signature'];

  if (!signature) {
    console.error('[Didit Auth] Missing webhook signature header');
    return res.status(401).json({ success: false, message: 'Missing signature' });
  }

  const rawBody = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', DIDIT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.error('[Didit Auth] Invalid webhook signature');
    return res.status(401).json({ success: false, message: 'Invalid signature' });
  }

  next();
};
