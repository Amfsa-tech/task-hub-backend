import mongoose from 'mongoose';
import dotenv from 'dotenv';
import KYCVerification from '../models/kycVerification.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const flagMaskedNins = async () => {
    try {
        await mongoose.connect(MONGO_URI);

        // Find all KYC records that have a maskedNin but no raw nin stored
        const result = await KYCVerification.updateMany(
            { maskedNin: { $ne: null }, nin: null },
            { $set: { ninResubmissionRequired: true } }
        );

        console.log(`Flagged ${result.modifiedCount} records for NIN resubmission`);
        process.exit(0);
    } catch (error) {
        console.error('Error flagging masked NINs:', error);
        process.exit(1);
    }
};

flagMaskedNins();
