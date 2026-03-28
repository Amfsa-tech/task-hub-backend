import { Schema, model } from 'mongoose';


const categorySchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    displayName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    icon: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    // Add this inside your categorySchema definition
    minimumPrice: {
        type: Number,
        default: 0
    },
    parentCategory: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    }
});

// Index for better query performance
categorySchema.index({ isActive: 1, name: 1 });

// Update the updatedAt field before saving
categorySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Virtual for formatted display
categorySchema.virtual('formattedName').get(function() {
    return this.displayName || this.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
});

const Category = model('Category', categorySchema);

export default Category; 