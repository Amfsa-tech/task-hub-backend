import { Schema, model } from 'mongoose';

const waitlistEmailSchema = new Schema({
    emailAddress: { type: String, required: true, unique: true, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

waitlistEmailSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const WaitlistEmail = model('WaitlistEmail', waitlistEmailSchema);

export default WaitlistEmail;
