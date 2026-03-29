import { Schema, model } from 'mongoose';

const universitySchema = new Schema({
    name: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true,
        index: true
    },
    abbreviation: { 
        type: String, 
        default: '' 
    },
    state: { 
        type: String, 
        default: '' 
    },
    location: { 
        type: String, 
        default: '' 
    },
    logo: { 
        type: String, 
        default: '' 
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    createdBy: { 
        type: Schema.Types.ObjectId, 
        ref: 'Admin' 
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

universitySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const University = model('University', universitySchema);

export default University;
