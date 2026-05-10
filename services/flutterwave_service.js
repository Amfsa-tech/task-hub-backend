import { FLW_SECRET_KEY, FRONTEND_URL, FLW_WEBHOOK_SECRET} from '../config/envConfig.js';
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
        this.secretKey = FLW_SECRET_KEY; // Ensure you are pulling from process.env
        this.baseUrl = FLW_BASE_URL || 'https://api.flutterwave.com/v3';
        this.webhookHash = FLW_WEBHOOK_SECRET; // You will need to add this to your .env
    }

    get headers() {
        return {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
        };
    }

    // --- 1. RECEIVE MONEY (Wallet Funding) ---
    async initializeTransaction({ email, amount, reference, metadata = {} }) {
        // FIX: Removed /100 division. FLW uses raw Naira.
        const actualAmount = Number(amount);

        // DYNAMIC CALLBACK
        const redirectUrl = `${FRONTEND_URL}/verify-payment`; 

        const payload = {
            tx_ref: reference,
            amount: actualAmount,
            currency: 'NGN',
            redirect_url: redirectUrl, 
            customer: { email },
            meta: metadata,
            customizations: {
                title: 'TaskHub Wallet Funding',
                description: 'Fund your TaskHub wallet'
            }
        };

        try {
            const response = await axios.post(`${this.baseUrl}/payments`, payload, { headers: this.headers });
            
            return {
                authorization_url: response.data.data.link,
                access_code: reference 
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
            const txResponse = await axios.get(`${this.baseUrl}/transactions?tx_ref=${encodeURIComponent(reference)}`, { headers: this.headers });
            
            if (!txResponse.data.data || txResponse.data.data.length === 0) {
                 return { status: 'pending', gateway_response: 'Transaction not found or still processing' };
            }

            const txId = txResponse.data.data[0].id;
            const verifyResponse = await axios.get(`${this.baseUrl}/transactions/${txId}/verify`, { headers: this.headers });
            const data = verifyResponse.data.data;

            let finalStatus = 'pending';
            if (data.status === 'successful') finalStatus = 'success';
            else if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'reversed') finalStatus = 'failed';

            return {
                status: finalStatus,
                // FIX: Removed kobo multiplication. Returning exact Naira amount.
                amount: Number(data.amount), 
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

    // --- 2. SEND MONEY (Tasker Payouts) ---
    async initiatePayout({ accountNumber, bankCode, amount, reference, narration = 'TaskHub Payout' }) {
        // 🛑 FIX: Removed all kobo logic. Passing raw Naira.
        const actualAmount = Number(amount);

        const payload = {
            account_bank: bankCode,
            account_number: accountNumber,
            amount: actualAmount,
            narration: narration,
            currency: "NGN",
            reference: reference,
            debit_currency: "NGN"
        };

        try {
            const response = await axios.post(`${this.baseUrl}/transfers`, payload, { headers: this.headers });
            
            return {
                status: 'success',
                transfer_code: response.data.data.id,
                message: response.data.message
            };
        } catch (error) {
            throw new FlutterwaveRequestError(
                error.response?.data?.message || 'Failed to initiate FLW payout',
                error.response?.status,
                error.response?.data,
                'Could not process payout to bank account.'
            );
        }
    }

    // --- 3. UTILITIES ---
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

    // --- 4. WEBHOOK SECURITY ---
    verifyWebhook(req) {
        // Flutterwave sends your secret hash in the 'verif-hash' header
        const signature = req.headers['verif-hash'];
        
        if (!signature || (signature !== this.webhookHash)) {
            return false;
        }
        return true;
    }
}

export default new FlutterwaveService();