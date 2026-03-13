import { Schema, model } from 'mongoose';

const waitlistSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Waitlist = model('Waitlist', waitlistSchema);
export default Waitlist;
