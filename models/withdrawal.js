import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema({
    tasker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tasker',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 500 // Minimum 500 Naira
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'approved', 'completed', 'rejected', 'failed'], // Ensure 'failed' is here
        default: 'pending'
    },
    payoutMethod: {
        type: String,
        enum: ['bank_transfer', 'stellar_crypto'],
        required: true,
        default: 'bank_transfer'
    },
    bankDetails: {
        bankName: { type: String },
        bankCode: { type: String },
        accountNumber: { type: String },
        accountName: { type: String }
    },
    stellarDetails: {
        publicKey: { type: String }, 
        memo: { type: String }       
    },
    blockchainTxId: {
        type: String 
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },
    balanceBefore: { 
        type: Number, 
        default: null 
    },
    balanceAfter: { 
        type: Number, 
        default: null 
    },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
    completedAt: { type: Date }
}, { timestamps: true });

withdrawalSchema.index({ tasker: 1, status: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Withdrawal', withdrawalSchema);