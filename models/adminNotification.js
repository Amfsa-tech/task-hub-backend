import { Schema, model } from 'mongoose';

const adminNotificationSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['Announcement', 'Alert', 'Warning', 'Update'], 
        default: 'Announcement'
    },
    audience: {
        type: String,
        enum: ['All Users', 'All Taskers', 'Selected Users', 'Everyone'], 
        required: true
    },
    recipientsCount: {
        type: Number,
        default: 0 
    },
    openedCount: {
        type: Number,
        default: 0 
    },
    sentBy: {
        type: Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    }
}, { timestamps: true });

const AdminNotification = model('AdminNotification', adminNotificationSchema);
export default AdminNotification;