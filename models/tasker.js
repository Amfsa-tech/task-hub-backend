import { Schema, model } from 'mongoose';

const taskerSchema = new Schema({ 
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    emailAddress: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    profilePicture: { type: String, default: '' },
    country: { type: String, required: true },
    originState: { type: String, required: true },
    residentState: { type: String, required: true, index: true }, // ADDED: For Location Analytics
    address: { type: String, required: true },
    
    location: {
        latitude: { type: Number },
        longitude: { type: Number },
        lastUpdated: { type: Date }
    },
    averageRating: { type: Number, default: 0, index: true },
    
    password: { type: String },
    wallet: { type: Number, default: 0 },

    authProviders: {
        type: [String],
        enum: ['local', 'google'],
        default: ['local']
    },
    googleId: { type: String, unique: true, sparse: true },
    
    bankAccount: {
        bankName: { type: String },
        bankCode: { type: String },
        accountNumber: { type: String },
        accountName: { type: String }
    },
    
    notificationId: { 
        type: String, 
        default: null,
        index: true 
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
    
    mainCategories: [{
        type: Schema.Types.ObjectId,
        ref: 'Category'
    }],
    subCategories: [{
        type: Schema.Types.ObjectId,
        ref: 'Category'
    }],
    university: {
        type: String,
        trim: true,
        default: null
    },

    previousWork: [{
        url: { type: String, required: true },
        publicId: { type: String }
    }],
    websiteLink: { type: String, default: '' },
    transactionPin: {
        type: String 
    },
    
    isEmailVerified: { type: Boolean, default: false, index: true }, // ADDED
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date },
    
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    
    verifyIdentity: { type: Boolean, default: false, index: true }, // ADDED
    isActive: { type: Boolean, default: true, index: true }, // ADDED
    
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

taskerSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

taskerSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// ADDED: Text Index so MongoDB can instantly search names and emails without scanning the whole DB
taskerSchema.index({ firstName: 'text', lastName: 'text', emailAddress: 'text' });

const Tasker = model('Tasker', taskerSchema);

export default Tasker;