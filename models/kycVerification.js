import mongoose from 'mongoose';

const kycVerificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'userType' 
    },

    userType: {
        type: String,
        required: true,
        enum: ['User', 'Tasker']
    },

    // Masked NIN only — raw NIN is never stored (PII protection)
    maskedNin: {
        type: String,
        default: null
    },

    provider: {
        type: String,
        enum: ['didit', 'qoreid'],
        default: 'didit'
    },

    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },

    diditSessionId: {
        type: String,
        default: null
    },

    // Non-PII verification metadata
    verificationData: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    rejectionReasons: {
        type: [String],
        default: []
    },

    verifiedAt: Date,

    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },

    reviewedAt: Date

}, { timestamps: true });

export default mongoose.model('KYCVerification', kycVerificationSchema);