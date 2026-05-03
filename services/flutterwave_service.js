import { FLW_SECRET_KEY, PAYSTACK_CALLBACK_URL } from '../config/envConfig.js';
import axios from 'axios';

const FLW_BASE_URL = 'https://api.flutterwave.com/v3';

class FlutterwaveRequestError extends Error {
    constructor(message, statusCode, details, publicMessage) {
        super(message);
        this.name = 'FlutterwaveRequestError';
        this.statusCode = statusCode;
        this.details = details;
        this.publicMessage = publicMessage || 'Payment service error';
    }
}

class FlutterwaveService {
    constructor() {
        this.secretKey = FLW_SECRET_KEY;
        this.baseUrl = FLW_BASE_URL;
    }

    get headers() {
        return {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
        };
    }

    async initializeTransaction({ email, amount, reference, metadata = {} }) {
        // FLW uses raw Naira, not kobo! 
        // We divide by 100 if the controller passed it in as kobo to match Paystack's flow
        const actualAmount = amount >= 100 ? amount / 100 : amount;

        const payload = {
            tx_ref: reference,
            amount: actualAmount,
            currency: 'NGN',
            redirect_url: PAYSTACK_CALLBACK_URL, // You can reuse the same frontend callback page
            customer: { email },
            meta: metadata,
            customizations: {
                title: 'TaskHub Wallet Funding',
                description: 'Fund your TaskHub wallet'
            }
        };

        try {
            const response = await axios.post(`${this.baseUrl}/payments`, payload, { headers: this.headers });
            
            // Mirroring Paystack's return shape for controller compatibility
            return {
                authorization_url: response.data.data.link,
                access_code: reference // FLW doesn't use access_code the same way, we use ref
            };
        } catch (error) {
            throw new FlutterwaveRequestError(
                error.response?.data?.message || 'Failed to initialize FLW transaction',
                error.response?.status,
                error.response?.data,
                'Failed to initialize payment gateway.'
            );
        }
    }

    async verifyTransaction(reference) {
        try {
            // First we have to fetch the transaction by tx_ref to get its ID
            const txResponse = await axios.get(`${this.baseUrl}/transactions?tx_ref=${encodeURIComponent(reference)}`, { headers: this.headers });
            
            if (!txResponse.data.data || txResponse.data.data.length === 0) {
                 return { status: 'failed', gateway_response: 'Transaction not found' };
            }

            const txId = txResponse.data.data[0].id;
            
            // Then verify the actual ID
            const verifyResponse = await axios.get(`${this.baseUrl}/transactions/${txId}/verify`, { headers: this.headers });
            const data = verifyResponse.data.data;

            // Mirror Paystack's return shape
            return {
                status: data.status === 'successful' ? 'success' : 'failed',
                amount: Math.round(data.amount * 100), // Convert back to kobo to match Paystack expectations
                gateway_response: data.processor_response,
                id: data.id,
                channel: data.payment_type,
                paid_at: data.created_at
            };
        } catch (error) {
            throw new FlutterwaveRequestError(
                error.response?.data?.message || 'Failed to verify FLW transaction',
                error.response?.status,
                error.response?.data,
                'Failed to verify payment gateway status.'
            );
        }
    }

    async listBanks() {
        try {
            const response = await axios.get(`${this.baseUrl}/banks/NG`, { headers: this.headers });
            return response.data.data;
        } catch (error) {
            throw new FlutterwaveRequestError('Failed to fetch FLW banks', error.response?.status, null, 'Could not fetch bank list.');
        }
    }

    async resolveAccountNumber(accountNumber, bankCode) {
        try {
            const response = await axios.post(`${this.baseUrl}/accounts/resolve`, {
                account_number: accountNumber,
                account_bank: bankCode
            }, { headers: this.headers });
            
            return {
                account_number: response.data.data.account_number,
                account_name: response.data.data.account_name
            };
        } catch (error) {
            throw new FlutterwaveRequestError('Failed to resolve account on FLW', error.response?.status, null, 'Could not verify bank account.');
        }
    }
}

export default new FlutterwaveService();