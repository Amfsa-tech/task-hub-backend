import mongoose from 'mongoose';
import * as Sentry from '@sentry/node';
import { MONGO_URI } from './envConfig.js';

/**
 * Database connection configuration
 */
const connectDB = async () => {
    try {
        // MongoDB connection options
        const options = {
            retryWrites: true,
            w: 'majority',
            appName: 'Cluster0',
        };

        // Use environment variable or fallback to hardcoded URI
        const uri = MONGO_URI;
        
        const conn = await mongoose.connect(uri, options);
        
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        console.log(`Database: ${conn.connection.name}`);
        
        return conn;
    } catch (error) {
        console.error('Database connection error:', error);
        Sentry.captureException(error);
        process.exit(1);
    }
};

/**
 * Graceful database disconnection
 */
const disconnectDB = async () => {
    try {
        await mongoose.connection.close();
        console.log('MongoDB disconnected');
    } catch (error) {
        console.error('Error disconnecting from MongoDB:', error);
        Sentry.captureException(error);
    }
};

/**
 * Database connection event handlers
 */
const setupConnectionHandlers = () => {
    // Connection events
    mongoose.connection.on('connected', () => {
        console.log('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
        console.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
        console.log('Mongoose disconnected from MongoDB');
    });

    // Handle application termination
    process.on('SIGINT', async () => {
        await disconnectDB();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await disconnectDB();
        process.exit(0);
    });
};

export { connectDB, disconnectDB, setupConnectionHandlers };
