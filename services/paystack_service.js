import { PAYSTACK_SECRET_KEY, PAYSTACK_CALLBACK_URL } from '../config/envConfig.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

class PaystackRequestError extends Error {
    constructor(message, statusCode, details, publicMessage) {
        super(message);
        this.name = 'PaystackRequestError';
        this.statusCode = statusCode;
        this.details = details;
        this.publicMessage = publicMessage || 'Payment service error';
    }
}

const isIpWhitelistError = (message) => {
    if (!message) {
        return false;
    }

    const normalized = String(message).toLowerCase();
    return normalized.includes('ip address') && normalized.includes('not allowed');
};

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

        if (!response.ok || !data.status) {
            const publicMessage = isIpWhitelistError(data?.message)
                ? 'Payment service configuration error. Please try again later.'
                : 'Failed to initialize payment.';
            throw new PaystackRequestError(
                data.message || 'Failed to initialize Paystack transaction',
                response.status,
                { data, status: response.status },
                publicMessage
            );
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

        if (!response.ok || !data.status) {
            const publicMessage = isIpWhitelistError(data?.message)
                ? 'Payment service configuration error. Please try again later.'
                : 'Failed to verify payment.';
            throw new PaystackRequestError(
                data.message || 'Failed to verify Paystack transaction',
                response.status,
                { data, status: response.status },
                publicMessage
            );
        }

        return data.data;
    }

    /**
     * List available banks for transfers.
     * @returns {Promise<Array>} Array of bank objects { name, code, ... }
     */
    async listBanks() {
        const response = await fetch(
            `${this.baseUrl}/bank?country=nigeria&perPage=100`,
            {
                method: 'GET',
                headers: this.headers,
            }
        );

        const data = await response.json();

        if (!response.ok || !data.status) {
            throw new PaystackRequestError(
                data.message || 'Failed to fetch banks',
                response.status,
                { data, status: response.status },
                'Could not fetch bank list.'
            );
        }

        return data.data;
    }

    /**
     * Resolve a bank account number to get the account name.
     * @param {string} accountNumber - The account number to resolve
     * @param {string} bankCode - The bank code
     * @returns {Promise<Object>} { account_number, account_name, bank_id }
     */
    async resolveAccountNumber(accountNumber, bankCode) {
        const response = await fetch(
            `${this.baseUrl}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
            {
                method: 'GET',
                headers: this.headers,
            }
        );

        const data = await response.json();

        if (!response.ok || !data.status) {
            throw new PaystackRequestError(
                data.message || 'Failed to resolve account',
                response.status,
                { data, status: response.status },
                'Could not verify bank account.'
            );
        }

        return data.data;
    }
}

export default new PaystackService();
