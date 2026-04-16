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
        min: 5000 // Minimum 5,000 Naira
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'rejected'],
        default: 'pending'
    },
    // NEW: Define how the Tasker wants to be paid
    payoutMethod: {
        type: String,
        enum: ['bank_transfer', 'stellar_crypto'],
        required: true,
        default: 'bank_transfer'
    },
    // UPDATED: Made these optional so crypto withdrawals don't crash
    bankDetails: {
        bankName: { type: String },
        bankCode: { type: String },
        accountNumber: { type: String },
        accountName: { type: String }
    },
    // NEW: Where to send the XLM
    stellarDetails: {
        publicKey: { type: String }, // The Tasker's G... address
        memo: { type: String }       // Optional (some exchanges require a memo)
    },
    // NEW: The Blockchain Receipt
    blockchainTxId: {
        type: String 
    },
    // Admin approval
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
    // Timestamps
    completedAt: { type: Date }
}, { timestamps: true });

withdrawalSchema.index({ tasker: 1, status: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Withdrawal', withdrawalSchema);