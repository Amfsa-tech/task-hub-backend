import Report from '../models/report.js';
import { logAdminAction } from '../utils/auditLogger.js'; // Import audit logger

// GET /api/admin/reports?page=1&limit=10&status=pending&search=spam
export const getAllReports = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;

        // 1. Build Query
        const filter = {};
        
        // Status Filter (Tabs: Pending | Resolved | Dismissed)
        if (status) filter.status = status;

        // Date Range Filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Search Filter (Search by reason or description)
        if (search) {
             filter.$or = [
                { reason: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // 2. Execute Query with Pagination
        const reports = await Report.find(filter)
            .populate('reporter', 'fullName emailAddress') // Who sent the report
            .populate('reportedUser', 'fullName emailAddress') // Who is being reported (if applicable)
            .populate('task', 'title') // Context (if reported on a task)
            .populate('reviewedBy', 'firstName lastName') // Admin who fixed it
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Report.countDocuments(filter);

        res.json({
            status: 'success',
            results: reports.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            reports
        });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch reports'
        });
    }
};

// PATCH /api/admin/reports/:id/resolve
export const resolveReport = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({ status: 'error', message: 'Report not found' });
        }

        report.status = 'resolved';
        report.reviewedBy = req.admin._id;
        report.reviewedAt = new Date();
        await report.save();

        // LOG ACTION
        await logAdminAction({
            adminId: req.admin._id,
            action: 'RESOLVE_REPORT',
            resourceType: 'Report',
            resourceId: report._id,
            req
        });

        res.json({ status: 'success', message: 'Report resolved' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to resolve report' });
    }
};

// PATCH /api/admin/reports/:id/dismiss
export const dismissReport = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({ status: 'error', message: 'Report not found' });
        }

        report.status = 'dismissed';
        report.reviewedBy = req.admin._id;
        report.reviewedAt = new Date();
        await report.save();

        // LOG ACTION
        await logAdminAction({
            adminId: req.admin._id,
            action: 'DISMISS_REPORT',
            resourceType: 'Report',
            resourceId: report._id,
            req
        });

        res.json({ status: 'success', message: 'Report dismissed' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to dismiss report' });
    }
};