import mongoose from 'mongoose';

const kycVerificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'userType',
        index: true 
    },
    userType: {
        type: String,
        required: true,
        enum: ['User', 'Tasker']
    },
    maskedNin: {
        type: String,
        default: null,
        index: true // ADDED: Faster searches
    },
    nin: {
        type: String,
        default: null,
        index: true // ADDED: Faster searches
    },
    ninResubmissionRequired: {
        type: Boolean,
        default: false
    },
    provider: {
        type: String,
        enum: ['didit', 'qoreid', 'vuvaa'],
        default: 'didit'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true // ADDED: Crucial for the Dashboard Tabs
    },
    diditSessionId: {
        type: String,
        default: null
    },
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

// ADDED: Compound index for blazing fast sorting on the KYC page
kycVerificationSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('KYCVerification', kycVerificationSchema);