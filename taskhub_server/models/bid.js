import { Schema, model } from 'mongoose';

const bidSchema = new Schema({
    task: {
        type: Schema.Types.ObjectId,
        ref: 'Task',
        required: true
    },
    tasker: {
        type: Schema.Types.ObjectId,
        ref: 'Tasker',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    message: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    bidType: {
        type: String,
        enum: ['custom', 'fixed'],
        default: 'custom'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure a tasker can only place one bid per task
bidSchema.index({ task: 1, tasker: 1 }, { unique: true });

const Bid = model('Bid', bidSchema);

export default Bid;