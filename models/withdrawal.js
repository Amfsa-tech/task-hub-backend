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
        min: 5000
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'completed', 'rejected'],
        default: 'pending'
    },
    bankDetails: {
        bankName: { type: String, required: true },
        bankCode: { type: String, required: true },
        accountNumber: { type: String, required: true },
        accountName: { type: String, required: true }
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
