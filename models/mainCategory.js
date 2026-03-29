import { Schema, model } from 'mongoose';

const mainCategorySchema = new Schema({
    name: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true, 
        trim: true,
        index: true
    },
    displayName: { 
        type: String, 
        required: true 
    },
    description: { 
        type: String, 
        default: '' 
    },
    icon: { 
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

mainCategorySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const MainCategory = model('MainCategory', mainCategorySchema);

export default MainCategory;
