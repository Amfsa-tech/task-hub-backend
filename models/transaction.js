// models/transaction.js
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    amount: { 
        type: Number, 
        required: true 
    },
    type: { 
        type: String, 
        enum: ['credit', 'debit'], // Matches the Green/Red badges in UI
        required: true 
    },
    description: { 
        type: String, 
        required: true // e.g., "Payment for Design Company..."
    },
    status: { 
        type: String, 
        enum: ['success', 'pending', 'failed'], 
        default: 'success' 
    },
    reference: { 
        type: String, 
        unique: true 
    }
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);