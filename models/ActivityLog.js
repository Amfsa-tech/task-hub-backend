import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
    // The person performing the action
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'onModel'
    },
    // Dynamically tells Mongoose which collection to look in
    onModel: {
        type: String,
        required: true,
        enum: ['User', 'Tasker']
    },
    action: {
        type: String,
        required: true,
        // Examples: 'LOGIN', 'PIN_UPDATE', 'WITHDRAWAL_REQUEST', 'PROFILE_UPDATE'
    },
    status: {
        type: String,
        enum: ['success', 'failed'],
        default: 'success'
    },
    ipAddress: String,
    userAgent: String,
    metadata: {
        type: Object,
        default: {}
    }
}, { timestamps: true });

// Indexing for fast admin searches
activityLogSchema.index({ performedBy: 1, action: 1, createdAt: -1 });

export default mongoose.model('ActivityLog', activityLogSchema);