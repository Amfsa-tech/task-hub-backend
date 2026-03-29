import { Schema, model } from 'mongoose';

const taskSchema = new Schema({
    title: { 
        type: String, 
        required: true 
    },
    description: { 
        type: String, 
        required: true 
    },
    // REPLACED: categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }]
    // NEW STRUCTURE:
    mainCategory: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Main category is required']
    },
    subCategory: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Subcategory is required']
    },
    university: {
        type: String, 
        trim: true,
        default: null
        // Note: Your taskController should validate that this is provided 
        // if the mainCategory name is "campus-tasks"
    },
    tags: [{ 
        type: String 
    }],
    images: [{
        url: { type: String, required: true }
    }],
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
    },
    budget: { 
        type: Number, 
        required: true 
    },
    isBiddingEnabled: { 
        type: Boolean, 
        default: false 
    },
    deadline: { 
        type: Date 
    },
    status: { 
        type: String, 
        enum: ['open', 'assigned', 'in-progress', 'completed', 'cancelled'],
        default: 'open'
    },
    escrowAmount: { type: Number, default: 0 },
    isEscrowHeld: { type: Boolean, default: false },
    escrowAt: { type: Date },
    platformFee: { type: Number, default: 0 },
    taskerPayout: { type: Number, default: 0 },
    completionCode: { type: String },
    completedAt: { type: Date },
    user: { 
        type: Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    assignedTasker: { 
        type: Schema.Types.ObjectId, 
        ref: 'Tasker' 
    },
    // Add these to your Task Schema:
    rating: { type: Number, min: 1, max: 5 },
    reviewText: { type: String },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    },
    platformFee: { type: Number, default: 0 },
    taskerPayout: { type: Number, default: 0 },
    escrowStatus: {
    type: String,
    enum: [
        'held',
        'release_requested',
        'released',
        'refund_requested',
        'refunded'
    ],
    default: 'held'
}

});

// ADD THIS INSTEAD (Optional but recommended based on your document)
taskSchema.pre('validate', async function(next) {
    if (this.mainCategory) {
        // We need to fetch the category to check its name
        const Category = mongoose.model('Category');
        const mainCat = await Category.findById(this.mainCategory);
        
        // If it's a Campus Task, ensure university is provided
        if (mainCat && mainCat.name === 'campus-tasks' && !this.university) {
            this.invalidate('university', 'University selection is required for Campus Tasks.');
        }
    }
    next();
});

// Create geospatial index for location-based queries
taskSchema.index({ location: '2dsphere' });

const Task = model('Task', taskSchema);

export default Task;