import { Schema, model } from 'mongoose';

const adminInviteSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    role: {
        type: String,
        default: 'operations' // Default role if not specified in the UI
    },
    token: {
        type: String,
        required: true
    },
    invitedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Admin'
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, { timestamps: true });

// Automatically delete the document after the expiration time
adminInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AdminInvite = model('AdminInvite', adminInviteSchema);
export default AdminInvite;