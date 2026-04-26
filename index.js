import './instrument.js';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import { connectDB, setupConnectionHandlers, PORT, NODE_ENV } from './config/index.js';
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
import kycRoute from './routes/kycRoute.js';
import adminTaskerRoutes from './routes/adminTaskerRoutes.js';
import adminPaymentRoutes from './routes/adminPaymentRoutes.js';
import adminStaffRoutes from './routes/adminStaffRoutes.js'; 
import adminChatRoutes from './routes/adminChatRoutes.js';   
import adminSettingsRoutes from './routes/adminSettingsRoutes.js';
import adminCategoryRoutes from './routes/adminCategoryRoutes.js';
import adminWithdrawalRoutes from './routes/adminWithdrawalRoutes.js';
import adminMainCategoryRoutes from './routes/adminMainCategoryRoutes.js';
import adminUniversityRoutes from './routes/adminUniversityRoutes.js';
import adminNotificationRoutes from './routes/adminNotificationRoutes.js';
import waitlistRoutes from './routes/waitlistRoute.js';
import walletRoutes from './routes/walletRoute.js';
import nearbyTaskerRoutes from './routes/nearbyTaskerRoute.js';
import mainCategoryRoutes from './routes/mainCategoryRoute.js';
import universityRoutes from './routes/universityRoute.js';
import ninSubmissionRoutes from './routes/taskerNinRoute.js';
import userNotificationRoutes from './routes/notificationRoutes.js';
import { checkMaintenanceMode } from './middlewares/maintenanceMiddleware.js';
import { startDepositListener } from './services/stellarListener.js';

const app = express();

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'UP', 
        timestamp: new Date(),
        version: '1.0.0' 
    });
});

// TEMPORARY: remove after confirming Render outbound IP for Paystack whitelist
app.get('/debug/outbound-ip', async (req, res) => {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        res.status(200).json({ outboundIp: data.ip });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const defaultAllowedOrigins = [
    'https://www.ngtaskhub.com',
    'http://localhost:3000',
    'http://localhost:3001',
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

// Start watching the Stellar blockchain for deposits
startDepositListener();

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

// Paystack webhook needs raw body for HMAC signature verification — must come before express.json()
app.use('/api/wallet/paystack-webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));

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
app.use('/api/admin/withdrawals', adminWithdrawalRoutes);
app.use('/api/admin/main-categories', adminMainCategoryRoutes);
app.use('/api/admin/universities', adminUniversityRoutes);
app.use('/api/admin/notifications', adminNotificationRoutes); // Admin Notifications


app.use(checkMaintenanceMode);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks',  taskRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/v1/kyc', kycRoute);          // Didit identity verification
app.use('/api/wallet', walletRoutes);        // Wallet funding (Paystack)
app.use('/api/taskers', nearbyTaskerRoutes); // Public nearby taskers
app.use('/api/main-categories', mainCategoryRoutes); // Public main categories
app.use('/api/universities', universityRoutes);       // Public universities
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/nin', ninSubmissionRoutes);
// User/Tasker side notifications
app.use('/api/notifications', userNotificationRoutes);



// Base route
app.get('/', (req, res) => {
    res.send('TaskHub API is running');
});     

// Debug Sentry route (non-production only)
if (NODE_ENV !== 'production') {
    app.get('/debug-sentry', function mainHandler(req, res) {
        throw new Error("My first Sentry error!");
    });
}

// The error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Clear Sentry user context and add request tags after each request
app.use((req, res, next) => {
  Sentry.configureScope(scope => {
    scope.setTag('route', req.route?.path || req.path);
    scope.setTag('method', req.method);
  });
  res.on('finish', () => {
    Sentry.setUser(null);
    Sentry.configureScope(scope => {
      scope.setTag('route', null);
      scope.setTag('method', null);
    });
  });
  next();
});

// Global process error handlers to ensure Sentry flushes before exit
process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  Sentry.captureException(err);
  console.error('Uncaught Exception:', err);
  Sentry.close(2000).then(() => process.exit(1));
});

// Error handling middleware
app.use((err, req, res, next) => {
    // Always capture with Sentry first
    Sentry.captureException(err);
    console.error('[GLOBAL ERROR HANDLER]', err.stack || err);

    // Handle payload too large errors with a friendly message
    if (err.type === 'entity.too.large' || err.status === 413) {
        return res.status(413).json({
            status: "error",
            message: 'The data you submitted is too large. Please reduce the file size and try again. Maximum allowed size is 10MB.',
        });
    }

    res.status(500).json({
        status: "error", 
        message: 'Something went wrong',
        sentryEventId: res.sentry || null,
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT_NUMBER = PORT || 3009;
// const PORT_NUMBER = 7000;

app.listen(PORT_NUMBER, () => {
        console.log(`Server is running on port ${PORT_NUMBER}`);
});