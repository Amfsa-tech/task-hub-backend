import Transaction from '../models/transaction.js';
import paystackService from '../services/paystack_service.js';
import { creditWallet } from '../controllers/walletController.js';

/**
 * POST /api/wallet/paystack-webhook
 * Handles Paystack webhook events.
 * The verifyPaystackSignature middleware has already validated the signature
 * and parsed the raw body into req.body.
 */
export const handlePaystackWebhook = async (req, res) => {
    // Always respond 200 quickly to acknowledge receipt
    // Paystack retries on non-2xx responses
    try {
        const event = req.body;

        console.log(`[Paystack Webhook] Event received: ${event.event}`);

        if (event.event === 'charge.success') {
            await handleChargeSuccess(event.data);
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('[Paystack Webhook] Processing error:', error);
        // Return 200 so Paystack does not retry on transient errors
        return res.status(200).json({ success: true });
    }
};

/**
 * Process a successful charge event from Paystack.
 */
async function handleChargeSuccess(data) {
    const reference = data.reference;

    if (!reference) {
        console.error('[Paystack Webhook] charge.success event missing reference');
        return;
    }

    // Find the pending internal transaction
    const transaction = await Transaction.findOne({ reference });

    if (!transaction) {
        console.warn(`[Paystack Webhook] No transaction found for reference: ${reference}`);
        return;
    }

    if (transaction.status === 'success') {
        console.log(`[Paystack Webhook] Transaction ${reference} already processed — skipping`);
        return;
    }

    // Verify with Paystack as an extra safety check
    const paystackData = await paystackService.verifyTransaction(reference);

    if (paystackData.status !== 'success') {
        console.warn(`[Paystack Webhook] Verification returned status "${paystackData.status}" for ${reference}`);
        return;
    }

    // Validate amount matches (Paystack returns amount in kobo)
    const expectedKobo = Math.round(transaction.amount * 100);
    if (paystackData.amount !== expectedKobo) {
        console.error(
            `[Paystack Webhook] Amount mismatch for ${reference}: expected ${expectedKobo} kobo, got ${paystackData.amount} kobo`
        );
        return;
    }

    // Credit the wallet atomically
    await creditWallet(transaction, paystackData);
}
