import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Admin from '../models/admin.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const createAdmin = async () => {
    try {
        await mongoose.connect(MONGO_URI);

        const existing = await Admin.findOne({ email: 'admin@taskhub.com' });
        if (existing) {
            console.log('Admin already exists');
            process.exit(0);
        }

        const admin = new Admin({
            name: 'Super Admin',
            email: 'admin@taskhub.com',
            password: 'Admin@12345', // WILL be hashed by pre-save hook
            role: 'super_admin'
        });

        await admin.save();

        console.log('Admin account created successfully');
        process.exit(0);

    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
};

createAdmin();
