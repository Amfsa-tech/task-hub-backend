import mongoose, { Schema, model } from 'mongoose';

const taskSchema = new Schema({
    title: { 
        type: String, 
        required: true,
    },
    description: { 
        type: String, 
        required: true 
    },
    mainCategory: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Main category is required'],
        index: true 
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
    },
    tags: [{ 
        type: String 
    }],
    images: [{
        url: { type: String, required: true },
        publicId: { type: String }
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
        default: 'open',
        index: true // ADDED: crucial for task filtering
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
        required: true ,
        index: true 
    },
    assignedTasker: { 
        type: Schema.Types.ObjectId, 
        ref: 'Tasker',
        index: true 
    },
    rating: { type: Number, min: 1, max: 5 },
    reviewText: { type: String },
    ratedAt: { type: Date },
    isReviewHidden: { type: Boolean, default: false },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    },
    escrowStatus: {
        type: String,
        enum: [
            'held',
            'release_requested',
            'released',
            'refund_requested',
            'refunded'
        ],
        default: 'held',
        index: true // ADDED: helps with financial queries
    }
});

taskSchema.pre('validate', async function(next) {
    if (this.mainCategory) {
        const Category = mongoose.model('Category');
        const mainCat = await Category.findById(this.mainCategory);
        
        if (mainCat && mainCat.name === 'campus-tasks' && !this.university) {
            this.invalidate('university', 'University selection is required for Campus Tasks.');
        }
    }
    next();
});

taskSchema.index({ location: '2dsphere' });

// ADDED: Text Index for searching task titles and descriptions
taskSchema.index({ title: 'text', description: 'text' });
// ADDED: Compound index for common dashboard queries
taskSchema.index({ status: 1, createdAt: -1 });

const Task = model('Task', taskSchema);

export default Task;