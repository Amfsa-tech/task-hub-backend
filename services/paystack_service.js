import { PAYSTACK_SECRET_KEY, PAYSTACK_CALLBACK_URL } from '../config/envConfig.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

class PaystackService {
    constructor() {
        this.secretKey = PAYSTACK_SECRET_KEY;
        this.baseUrl = PAYSTACK_BASE_URL;
    }

    get headers() {
        return {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Initialize a Paystack transaction for wallet funding.
     * @param {Object} params
     * @param {string} params.email - User's email address
     * @param {number} params.amount - Amount in kobo (NGN smallest unit)
     * @param {string} params.reference - Unique internal reference
     * @param {Object} [params.metadata] - Additional metadata
     * @returns {Promise<Object>} Paystack initialization response with authorization_url
     */
    async initializeTransaction({ email, amount, reference, metadata = {} }) {
        const payload = {
            email,
            amount,
            reference,
            callback_url: PAYSTACK_CALLBACK_URL,
            currency: 'NGN',
            metadata,
        };

        const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!data.status) {
            throw new Error(data.message || 'Failed to initialize Paystack transaction');
        }

        return data.data;
    }

    /**
     * Verify a Paystack transaction by reference.
     * @param {string} reference - The transaction reference to verify
     * @returns {Promise<Object>} Paystack verification response
     */
    async verifyTransaction(reference) {
        const response = await fetch(
            `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
            {
                method: 'GET',
                headers: this.headers,
            }
        );

        const data = await response.json();

        if (!data.status) {
            throw new Error(data.message || 'Failed to verify Paystack transaction');
        }

        return data.data;
    }
}

export default new PaystackService();
