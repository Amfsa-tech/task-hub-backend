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
import adminStaffRoutes from './routes/adminStaffRoutes.js'; 
import adminChatRoutes from './routes/adminChatRoutes.js';   
import adminSettingsRoutes from './routes/adminSettingsRoutes.js';
import adminCategoryRoutes from './routes/adminCategoryRoutes.js';
import waitlistRoutes from './routes/waitlistRoute.js';
import { checkMaintenanceMode } from './middlewares/maintenanceMiddleware.js';

const app = express();

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'UP', 
        timestamp: new Date(),
        version: '1.0.0' 
    });
});

const defaultAllowedOrigins = [
    'https://www.ngtaskhub.com',
    'http://localhost:3000',
    'http://localhost:5173'
];

const configuredAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins]));

const wildcardOriginSuffixes = allowedOrigins
    .filter((origin) => origin.startsWith('*.'))
    .map((origin) => origin.slice(1).toLowerCase());

const isAllowedOrigin = (origin) => {
    if (!origin) {
        return true;
    }

    if (allowedOrigins.includes(origin)) {
        return true;
    }

    const normalizedOrigin = origin.toLowerCase();
    return wildcardOriginSuffixes.some((suffix) => normalizedOrigin.endsWith(suffix));
};

// Setup database connection handlers
setupConnectionHandlers();

// Connect to MongoDB
await connectDB();

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());

app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/me', adminProtectedRoutes); // ONLY for /me and system stuff
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/tasks', adminTaskRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/audit-logs', adminAuditRoutes);
app.use('/api/admin/kyc', adminKycRoutes);
app.use('/api/admin/taskers', adminTaskerRoutes);
app.use('/api/admin/payments', adminPaymentRoutes);
app.use('/api/admin/staff', adminStaffRoutes);       // Staff Management
app.use('/api/admin/messages', adminChatRoutes);     // Support Chat
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin/categories', adminCategoryRoutes);


app.use(checkMaintenanceMode);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks',  taskRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/kyc', ninRoutes);
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
