// models/transaction.js
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
    },
    tasker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tasker'
    },
    amount: { 
        type: Number, 
        required: true 
    },
    type: { 
        type: String, 
        enum: ['credit', 'debit'],
        required: true 
    },
    description: { 
        type: String, 
        required: true
    },
    status: { 
        type: String, 
        enum: ['success', 'pending', 'failed'], 
        default: 'pending' 
    },
    reference: { 
        type: String, 
        unique: true,
        required: true
    },
    provider: {
        type: String,
        enum: ['paystack', 'system'],
        default: 'system'
    },
    paymentPurpose: {
        type: String,
        enum: ['wallet_funding', 'escrow_hold', 'escrow_release', 'escrow_refund', 'withdrawal', 'platform_fee', 'other'],
        default: 'other'
    },
    currency: {
        type: String,
        default: 'NGN'
    },
    providerTransactionId: {
        type: String
    },
    gatewayResponse: {
        type: String
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    verifiedAt: {
        type: Date
    },
    creditedAt: {
        type: Date
    }
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);