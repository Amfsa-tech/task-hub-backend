import AdminAuditLog from '../models/adminAuditLog.js'; // Ensure file name matches

// GET /api/admin/audit-logs?page=1&limit=20&action=APPROVE_KYC
export const getAuditLogs = async (req, res) => {
    try {
        const { page = 1, limit = 20, action, adminId, resourceType, startDate, endDate } = req.query;
        
        // 1. Build Dynamic Filter
        const query = {};

        if (action) query.action = action;
        if (resourceType) query.resourceType = resourceType;
        if (adminId) query.admin = adminId; // Filter by specific admin

        // Date Range Filter (Critical for Audits)
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // 2. Execute Query
        const logs = await AdminAuditLog.find(query)
            .populate('admin', 'firstName lastName email') // Adjust fields based on your Admin model
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await AdminAuditLog.countDocuments(query);

        res.json({
            status: 'success',
            results: logs.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            logs
        });

    } catch (error) {
        console.error('Fetch audit logs error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch audit logs'
        });
    }
};

// GET /api/admin/audit-logs/filters (Optional helper for UI dropdowns)
export const getAuditFilters = async (req, res) => {
    try {
        const actions = await AdminAuditLog.distinct('action');
        const resources = await AdminAuditLog.distinct('resourceType');
        res.json({ status: 'success', actions, resources });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch filters' });
    }
};

