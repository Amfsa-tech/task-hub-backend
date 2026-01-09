import { Schema, model } from 'mongoose';

const taskerSchema = new Schema({ 
    firstName: { type: String, required: true, },
    lastName: { type: String, required: true, },
    emailAddress: {type: String, required: true, unique: true},
    phoneNumber: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    profilePicture: { type: String, default: '' },
    country: { type: String, required: true },
    originState: { type: String, required: true },
    residentState: { type: String, required: true },
    address: { type: String, required: true },
    
    // Current location coordinates for distance-based task matching
    location: {
        latitude: { type: Number },
        longitude: { type: Number },
        lastUpdated: { type: Date }
    },
    
    password: { type: String, required: true, unique: true },
    wallet: { type: Number, default: 0 },
    
    // Push notification configuration
    notificationId: { 
        type: String, 
        default: null,
        index: true // Index for efficient querying when sending notifications
    },
    
    // Task categories the tasker can handle
    categories: [{ 
        type: Schema.Types.ObjectId,
        ref: 'Category'
    }],
    
    // New authentication fields
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date },
    
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    
    // Identity verification
    verifyIdentity: { type: Boolean, default: false },
    
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Virtual for checking if account is locked
taskerSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Update the updatedAt field before saving
taskerSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Tasker = model('Tasker', taskerSchema);

export default Tasker;