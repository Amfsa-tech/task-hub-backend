import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },

    password: {
        type: String,
        required: true
    },

    role: {
        type: String,
        enum: ['super_admin', 'operations', 'trust_safety', 'finance'],
        default: 'operations'
    },

    isActive: {
        type: Boolean,
        default: true
    },

    isLocked: {
        type: Boolean,
        default: false
    },
    lastLogin: { type: Date },
    phoneNumber: { type: String },
    location: { type: String },
    
}, { timestamps: true });

adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

export default mongoose.model('Admin', adminSchema);
