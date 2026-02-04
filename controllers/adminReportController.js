import Report from '../models/report.js';

// GET /api/admin/reports
export const getAllReports = async (req, res) => {
    try {
        const { status } = req.query;

        const filter = {};
        if (status) filter.status = status;

        const reports = await Report.find(filter)
            .populate('reporter', 'fullName emailAddress')
            .populate('reviewedBy', 'name email')
            .sort({ createdAt: -1 });

        res.json({
            status: 'success',
            count: reports.length,
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
            return res.status(404).json({
                status: 'error',
                message: 'Report not found'
            });
        }

        report.status = 'resolved';
        report.reviewedBy = req.admin._id;
        report.reviewedAt = new Date();

        await report.save();

        res.json({
            status: 'success',
            message: 'Report resolved'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to resolve report'
        });
    }
};

// PATCH /api/admin/reports/:id/dismiss
export const dismissReport = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({
                status: 'error',
                message: 'Report not found'
            });
        }

        report.status = 'dismissed';
        report.reviewedBy = req.admin._id;
        report.reviewedAt = new Date();

        await report.save();

        res.json({
            status: 'success',
            message: 'Report dismissed'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to dismiss report'
        });
    }
};
