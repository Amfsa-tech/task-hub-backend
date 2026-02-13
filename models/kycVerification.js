import mongoose from 'mongoose';

const kycVerificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // This tells Mongoose to look at the 'userType' field to decide 
        // which collection to use for population.
        refPath: 'userType' 
    },

    // New field to distinguish between User and Tasker
    userType: {
        type: String,
        required: true,
        enum: ['User', 'Tasker'] // These must match your model names exactly
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