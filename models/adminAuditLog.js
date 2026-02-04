import mongoose from 'mongoose';

const adminAuditLogSchema = new mongoose.Schema({
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },

    action: {
        type: String,
        required: true
    },

    resourceType: {
        type: String,
        required: true
    },

    resourceId: {
        type: mongoose.Schema.Types.ObjectId
    },

    metadata: {
        type: Object
    },

    ipAddress: {
        type: String
    },

    userAgent: {
        type: String
    }

}, { timestamps: true });

export default mongoose.model('AdminAuditLog', adminAuditLogSchema);
