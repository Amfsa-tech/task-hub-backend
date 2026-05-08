import mongoose, { Schema, model } from 'mongoose';

const adminSettingsSchema = new Schema({
    system: {
        maintenanceMode: { type: Boolean, default: false },
        newUserRegistrations: { type: Boolean, default: true },
        taskPostingEnabled: { type: Boolean, default: true }
    },
    security: {
        twoFactorAuthRequired: { type: Boolean, default: false },
        sessionTimeout: { type: Number, default: 30 }, // in minutes
        ipWhitelistEnabled: { type: Boolean, default: false }
    },
    notifications: {
        emailNotifications: { type: Boolean, default: true },
        reportAlerts: { type: Boolean, default: true },
        kycSubmissionAlerts: { type: Boolean, default: true }
    },
    payments: {
        activeFiatGateway: { 
            type: String, 
            enum: ['flutterwave', 'paystack'], 
            default: 'flutterwave' 
        }
    },
    systemInfo: {
        version: { type: String, default: '1.0.0' },
        lastBackup: { type: Date, default: Date.now }
    }
}, { timestamps: true });

// FIX: Use mongoose.models to check for the compiled model
const AdminSettings = mongoose.models.AdminSettings || model('AdminSettings', adminSettingsSchema);

export default AdminSettings;