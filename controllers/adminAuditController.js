import AdminAuditLog from '../models/adminAuditLog.js';

export const getAuditLogs = async (req, res) => {
    try {
        const logs = await AdminAuditLog.find()
            .populate('admin', 'name email role')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({
            status: 'success',
            count: logs.length,
            logs
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch audit logs'
        });
    }
};
