import { Schema, model } from 'mongoose';

const userSchema = new Schema({ 
    fullName: { type: String, required: true, },
    emailAddress: {type: String, required: true, unique: true},
    phoneNumber: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    profilePicture: { type: String, default: '' },
    country: { type: String, required: true },
    originState: { type: String, },
    residentState: { type: String, required: true },
    area: { type: String,  },
    address: { type: String, required: true },
    password: { type: String },
    wallet: { type: Number, default: 0 },

    // Linked auth providers (e.g. 'local', 'google')
    authProviders: {
        type: [String],
        enum: ['local', 'google'],
        default: ['local']
    },
    googleId: { type: String, unique: true, sparse: true },
    
    // Push notification configuration
    notificationId: { 
        type: String, 
        default: null,
        index: true // Index for efficient querying when sending notifications
    },
    // Web Push subscriptions (browser push notifications)
    pushSubscriptions: [{
        endpoint: { type: String, required: true },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        },
        createdAt: { type: Date, default: Date.now }
    }],
    stellarMemoId: { 
        type: String, 
        unique: true, 
        sparse: true // Allows some users to not have one yet
    },
    // Admin role
    isAdmin: { type: Boolean, default: false },
    
    // New authentication fields
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date },
    
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    
    isActive: { type: Boolean, default: true },
    isDeleted: {type: Boolean,default: false},

    isKYCVerified: { type: Boolean,default: false},
    verifyIdentity: { type: Boolean, default: false },
    notificationId: {type: String},

    lastLoginAt: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Virtual for checking if account is locked
userSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const User = model('User', userSchema);

export default User;