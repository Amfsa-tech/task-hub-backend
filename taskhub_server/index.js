import express from 'express';
import cors from 'cors';
import { connectDB, setupConnectionHandlers, PORT } from './config/index.js';
import authRoutes from './routes/authRoute.js';
import taskRoutes from './routes/taskRoute.js';
import bidRoutes from './routes/bidRoute.js';
import categoryRoutes from './routes/categoryRoute.js';
import chatRoutes from './routes/chatRoute.js';
import waitlistRoutes from './routes/waitlistRoute.js';

const app = express();

// Setup database connection handlers
setupConnectionHandlers();

// Connect to MongoDB
await connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/waitlist', waitlistRoutes);

// Base route
app.get('/', (req, res) => {
    res.send('TaskHub API is running');
});     

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: "error", 
        message: 'Something went wrong',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT_NUMBER = PORT || 3009;
// const PORT_NUMBER = 7000;

app.listen(PORT_NUMBER, () => {
        console.log(`Server is running on port ${PORT_NUMBER}`);
});
