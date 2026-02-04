import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    targetType: {
        type: String,
        enum: ['user', 'tasker', 'task'],
        required: true
    },

    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    reason: {
        type: String,
        required: true
    },

    description: {
        type: String
    },

    status: {
        type: String,
        enum: ['pending', 'resolved', 'dismissed'],
        default: 'pending'
    },

    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },

    reviewedAt: {
        type: Date
    }

}, { timestamps: true });

export default mongoose.model('Report', reportSchema);
