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

    // Masked NIN for display purposes
    maskedNin: {
        type: String,
        default: null
    },

    // Raw NIN stored for manual verification by admins
    nin: {
        type: String,
        default: null
    },

    // Flag for records where NIN was irreversibly masked and needs resubmission
    ninResubmissionRequired: {
        type: Boolean,
        default: false
    },

    provider: {
        type: String,
        enum: ['didit', 'qoreid'],
        default: 'didit'
    },

    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
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