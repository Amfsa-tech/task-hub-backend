import mongoose from 'mongoose';

const kycVerificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    nin: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },

    verificationSummary: {
        matchStatus: String,
        mismatches: [String]
    },

    verifiedAt: Date,

    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },

    reviewedAt: Date,

    rejectionReason: String

}, { timestamps: true });

export default mongoose.model('KYCVerification', kycVerificationSchema);
