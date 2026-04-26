// --- EXISTING MODELS ---
import Report from '../models/report.js';
import Task from '../models/task.js';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import KYCVerification from '../models/kycVerification.js';

// --- NEW MODELS & UTILS ---
import Transaction from '../models/transaction.js'; // For Payment Exports
import Category from '../models/category.js';       // For Task Category population
import ActivityLog from '../models/ActivityLog.js'; // The User/Tasker activity log we just built
import AuditLog from '../models/adminAuditLog.js';  // Existing Admin actions log
import ActivityLogModel from '../models/ActivityLog.js'; // Alias if needed for clarity

// --- UTILITIES ---
import { logAdminAction } from '../utils/auditLogger.js';
import { logActivity } from '../utils/activityLogger.js'; // To log things during moderation
import { escapeRegex } from '../utils/searchUtils.js';
import { sendExportResponse } from '../utils/exportUtils.js'; // The CSV/JSON utility

// --- EXTERNAL LIBRARIES ---
import mongoose from 'mongoose';
import { Parser } from 'json2csv';
import * as Sentry from '@sentry/node';

// --- SECTION 1: MODERATION REPORTS (User Disputes/Spam) ---

// GET /api/admin/reports
export const getAllReports = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;

        const filter = {};
        if (status) filter.status = status;

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            const escaped = escapeRegex(search);
             filter.$or = [
                { reason: { $regex: escaped, $options: 'i' } },
                { description: { $regex: escaped, $options: 'i' } }
            ];
        }

        const reports = await Report.find(filter)
            .populate('reporter', 'fullName emailAddress')
            .populate('reportedUser', 'fullName emailAddress')
            .populate('task', 'title')
            .populate('reviewedBy', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Report.countDocuments(filter);

        res.json({
            status: 'success',
            totalRecords: total,
            reports
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch reports' });
    }
};

// PATCH /api/admin/reports/:id/resolve
export const resolveReport = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ status: 'error', message: 'Report not found' });

        report.status = 'resolved';
        report.reviewedBy = req.admin._id;
        report.reviewedAt = new Date();
        await report.save();

        await logAdminAction({
            adminId: req.admin._id,
            action: 'RESOLVE_REPORT',
            resourceType: 'Report',
            resourceId: report._id,
            req
        });

        res.json({ status: 'success', message: 'Report resolved' });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to resolve report' });
    }
};

// --- SECTION 2: SYSTEM EXPORTS (CSV/Data Generation) ---

// GET /api/admin/reports/export/tasks
// GET /api/admin/reports/export/tasks
export const exportTaskReport = async (req, res) => {
    try {
        const { format } = req.query;
        
        // Fetch tasks and populate the User (client) and Tasker (assigned pro)
        const tasks = await Task.find()
            .populate('user', 'fullName emailAddress')
            .populate('tasker', 'firstName lastName')
            .sort({ createdAt: -1 });

        // Mapping the data to flatten populated fields for the CSV
        const reportData = tasks.map(t => ({
            taskId: t._id,
            title: t.title,
            client: t.user?.fullName || 'N/A',
            tasker: t.tasker ? `${t.tasker.firstName} ${t.tasker.lastName}` : 'Unassigned',
            budget: t.budget,
            status: t.status,
            category: t.categoryName || 'General',
            createdAt: t.createdAt
        }));

        const fields = ['taskId', 'title', 'client', 'tasker', 'budget', 'status', 'category', 'createdAt'];
        
        return sendExportResponse(res, reportData, fields, 'Tasks_Operational_Report', format);
    } catch (error) {
        Sentry.captureException(error);
        console.error('Task export error:', error);
        res.status(500).json({ status: 'error', message: 'Task export failed' });
    }
};

// GET /api/admin/reports/export/payments
export const exportPaymentReport = async (req, res) => {
    try {
        const { format } = req.query;

        const transactions = await Transaction.find()
            .populate('user', 'fullName')
            .populate('tasker', 'firstName lastName')
            .sort({ createdAt: -1 });

        const reportData = transactions.map(tx => ({
            txId: tx._id,
            party: tx.user?.fullName || `${tx.tasker?.firstName} ${tx.tasker?.lastName}` || 'System',
            amount: tx.amount,
            currency: tx.currency,
            type: tx.type, // credit/debit
            purpose: tx.paymentPurpose, // deposit/withdrawal/escrow
            provider: tx.provider, // stellar/paystack/system
            status: tx.status,
            reference: tx.reference,
            date: tx.createdAt
        }));

        const fields = ['txId', 'party', 'amount', 'currency', 'type', 'purpose', 'provider', 'status', 'reference', 'date'];
        
        return sendExportResponse(res, reportData, fields, 'Financial_Payments_Report', format);
    } catch (error) {
        Sentry.captureException(error);
        console.error('Payment export error:', error);
        res.status(500).json({ status: 'error', message: 'Payment export failed' });
    }
};

// GET /api/admin/reports/export/dashboard
export const exportDashboardSummary = async (req, res) => {
    try {
        const { format } = req.query;

        // Aggregate core stats
        const userCount = await User.countDocuments();
        const taskerCount = await Tasker.countDocuments();
        const activeTasks = await Task.countDocuments({ status: { $in: ['open', 'in-progress'] } });
        
        const revenueAgg = await Transaction.aggregate([
            { $match: { status: 'success', type: 'credit' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const summaryData = [{
            totalUsers: userCount,
            totalTaskers: taskerCount,
            activeTasks: activeTasks,
            totalRevenue: revenueAgg[0]?.total || 0,
            reportGeneratedAt: new Date()
        }];

        const fields = ['totalUsers', 'totalTaskers', 'activeTasks', 'totalRevenue', 'reportGeneratedAt'];

        return sendExportResponse(res, summaryData, fields, 'Dashboard_Snapshot', format);
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Summary export failed' });
    }
};

// GET /api/admin/reports/export/users
export const exportUserReport = async (req, res) => {
    try {
        const { format } = req.query; // Get ?format=csv from URL
        const users = await User.find().select('fullName emailAddress phoneNumber country residentState wallet isActive createdAt');

        const fields = ['fullName', 'emailAddress', 'phoneNumber', 'country', 'residentState', 'wallet', 'isActive', 'createdAt'];
        
        Sentry.captureException(error);
        return sendExportResponse(res, users, fields, 'Users_Report', format);
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'User export failed' });
    }
};

// 2. Export Tasker Report
export const exportTaskerReport = async (req, res) => {
    try {
        const { format } = req.query;
        const taskers = await Tasker.find().select('firstName lastName emailAddress phoneNumber wallet isKYCVerified isActive');

        const fields = ['firstName', 'lastName', 'emailAddress', 'phoneNumber', 'wallet', 'isKYCVerified', 'isActive'];
        
        return sendExportResponse(res, taskers, fields, 'Taskers_Report', format);
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Tasker export failed' });
    }
};
// 1. Add this import at the top of your file

// --- SECTION 3: ACTIVITY LOGS & SYSTEM AUDITS ---

/**
 * GET /api/admin/reports/activity-logs
 * Powers the main "Activity Log" timeline in image_88562b.jpg
 */
export const getAllActivityLogs = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, userType } = req.query;
        const filter = {};

        if (search) {
            const escaped = escapeRegex(search);
            
            // 1. Find matching Users and Taskers first
            const [matchedUsers, matchedTaskers] = await Promise.all([
                User.find({ 
                    $or: [
                        { fullName: { $regex: escaped, $options: 'i' } },
                        { emailAddress: { $regex: escaped, $options: 'i' } }
                    ] 
                }).select('_id'),
                Tasker.find({ 
                    $or: [
                        { firstName: { $regex: escaped, $options: 'i' } },
                        { lastName: { $regex: escaped, $options: 'i' } },
                        { emailAddress: { $regex: escaped, $options: 'i' } }
                    ] 
                }).select('_id')
            ]);

            const userIds = matchedUsers.map(u => u._id);
            const taskerIds = matchedTaskers.map(t => t._id);

            // 2. Build the complex filter
            filter.$or = [
                { performedBy: { $in: [...userIds, ...taskerIds] } },
                { action: { $regex: escaped, $options: 'i' } },
                { ipAddress: { $regex: escaped, $options: 'i' } }
            ];
        }

        if (userType) filter.onModel = userType;

        const logs = await ActivityLog.find(filter)
            .populate('performedBy', 'firstName lastName fullName emailAddress profilePicture')
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await ActivityLog.countDocuments(filter);

        res.json({
            status: 'success',
            totalRecords: total,
            logs
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Search failed' });
    }
};

/**
 * GET /api/admin/reports/:id
 * Powers the "Report Details" drill-down view in image_88564e.jpg
 */
export const getReportDetails = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate('reporter', 'fullName emailAddress profilePicture phone')
            .populate('reportedUser', 'fullName emailAddress profilePicture phone')
            .populate('task', 'title description budget status')
            .populate('reviewedBy', 'firstName lastName');

        if (!report) {
            return res.status(404).json({ status: 'error', message: 'Report not found' });
        }

        res.json({
            status: 'success',
            data: report
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Fetch report details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch report details' });
    }
};

export const getUserSecuritySummary = async (req, res) => {
    try {
        const { userId } = req.params;

        const stats = await ActivityLog.aggregate([
            { $match: { performedBy: new mongoose.Types.ObjectId(userId) } },
            { $group: {
                _id: "$action",
                count: { $sum: 1 },
                lastSeen: { $max: "$createdAt" }
            }}
        ]);

        const failedLogins = stats.find(s => s._id === 'LOGIN_FAILED')?.count || 0;

        res.json({
            status: 'success',
            data: {
                totalActions: stats.reduce((acc, curr) => acc + curr.count, 0),
                failedLogins,
                recentActions: stats.slice(0, 5)
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Could not fetch security summary' });
    }
};