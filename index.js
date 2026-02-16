import express from 'express';
import cors from 'cors';
import { connectDB, setupConnectionHandlers, PORT } from './config/index.js';
import authRoutes from './routes/authRoute.js';
import taskRoutes from './routes/taskRoute.js';
import bidRoutes from './routes/bidRoute.js';
import categoryRoutes from './routes/categoryRoute.js';
import chatRoutes from './routes/chatRoute.js';
import adminAuthRoutes from './routes/adminAuthRoute.js';
import adminProtectedRoutes from './routes/adminProtectedRoute.js';
import adminDashboardRoutes from './routes/adminDashboardRoute.js';
import adminUserRoutes from './routes/adminUserRoute.js';
import adminTaskRoutes from './routes/adminTaskRoutes.js';
import adminReportRoutes from './routes/adminReportRoutes.js';
import adminAuditRoutes from './routes/adminAuditRoutes.js';
import adminKycRoutes from './routes/adminKycRoutes.js';
import ninRoutes from './routes/ninRoutes.js';
import adminTaskerRoutes from './routes/adminTaskerRoutes.js';
import adminPaymentRoutes from './routes/adminPaymentRoutes.js';
import adminStaffRoutes from './routes/adminStaffRoutes.js'; // Staff Management
import adminChatRoutes from './routes/adminChatRoutes.js';   // Admin Messages/Support
import adminReportRoutes from './routes/adminReportRoutes.js'; // This now includes Logs & Exports
import adminSettingsRoutes from './routes/adminSettingsRoutes.js';

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
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/me', adminProtectedRoutes); // ONLY for /me and system stuff
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/tasks', adminTaskRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/audit-logs', adminAuditRoutes);
app.use('/api/admin/kyc', adminKycRoutes);
app.use('/api/kyc', ninRoutes);
app.use('/api/admin/taskers', adminTaskerRoutes);
app.use('/api/admin/payments', adminPaymentRoutes);
app.use('/api/admin/staff', adminStaffRoutes);       // Staff Management
app.use('/api/admin/messages', adminChatRoutes);     // Support Chat
// 1. Dashboard & Reports (Includes Exports and Activity Logs)
// This powers the "Dashboard", "Payments", and "Report & Logs" pages
app.use('/api/admin/reports', adminReportRoutes);

// 2. Messages & Conversations
// This powers the "Messages" page for monitoring user chats
app.use('/api/admin/messages', adminChatRoutes);

// 3. System Settings
// This powers the "Settings" page for maintenance mode and global toggles
app.use('/api/admin/settings', adminSettingsRoutes);


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
