import Tasker from '../models/tasker.js';
import Task from '../models/task.js';
import Category from '../models/category.js';
import Report from '../models/report.js';
import KYCVerification from '../models/kycVerification.js'; // Add this!
import { logAdminAction } from '../utils/auditLogger.js';

// GET /api/admin/taskers/stats
export const getTaskerStats = async (req, res) => {
    try {
        const [
            totalTaskers,
            activeTaskers,
            verifiedTaskers,
            pendingKyc,
            suspendedTaskers,
            completedTasks,
            totalCategories,
            disputes
        ] = await Promise.all([
            Tasker.countDocuments(),
            Tasker.countDocuments({ isActive: true }),
            Tasker.countDocuments({ verifyIdentity: true }), // Matched your model
            Tasker.countDocuments({ verifyIdentity: false }), // Matched your model
            Tasker.countDocuments({ isActive: false }), 
            Task.countDocuments({ status: 'completed' }),
            Category.countDocuments(),
            Report.countDocuments({ status: 'pending' })
        ]);

        // Calculate Average Rating (If you add the field later)
        // Currently defaults to 0 to prevent crash since field is missing in schema
        const ratingAgg = await Tasker.aggregate([
            { $match: { averageRating: { $exists: true } } }, 
            { $group: { _id: null, avg: { $avg: '$averageRating' } } }
        ]);
        const avgRating = ratingAgg[0]?.avg?.toFixed(1) || 0;

        res.json({
            status: 'success',
            data: {
                total: totalTaskers,
                active: activeTaskers,
                verified: verifiedTaskers,
                suspended: suspendedTaskers,
                pendingKyc,
                completedTasks,
                categories: totalCategories,
                averageRating: avgRating,
                disputes
            }
        });
    } catch (error) {
        console.error('Tasker stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch tasker stats' });
    }
};

// GET /api/admin/taskers (List View)
export const getAllTaskers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, verified, status, sort } = req.query;

        const query = {};

        // Search
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { emailAddress: { $regex: search, $options: 'i' } } // Fixed: emailAddress
            ];
        }

        // Filters
        if (verified) query.verifyIdentity = verified === 'true'; // Fixed: verifyIdentity
        if (status === 'active') query.isActive = true;
        if (status === 'suspended') query.isActive = false;

        // Sorting
        let sortOption = { createdAt: -1 }; 
        if (sort === 'rating') sortOption = { averageRating: -1 }; 

        const taskers = await Tasker.find(query)
            .select('-password') 
            .populate('categories', 'name') // <--- CRITICAL: Fetches category names for the UI table
            .sort(sortOption)
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Tasker.countDocuments(query);

        res.json({
            status: 'success',
            results: taskers.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            taskers
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch taskers' });
    }
};

// GET /api/admin/taskers/:id
export const getTaskerById = async (req, res) => {
    try {
        const taskerId = req.params.id;

        // 1. Fetch Tasker Profile & Categories
        const tasker = await Tasker.findById(taskerId)
            .select('-password')
            .populate('categories', 'name');

        if (!tasker) {
            return res.status(404).json({ status: 'error', message: 'Tasker not found' });
        }

        // 2. Fetch KYC Details
        const kycRecord = await KYCVerification.findOne({ user: taskerId })
            .select('idType idNumber status');

        // 3. Calculate Statistics
        const totalAssigned = await Task.countDocuments({ assignedTasker: tasker._id });
        const completedCount = await Task.countDocuments({ assignedTasker: tasker._id, status: 'completed' });
        
        // Completion Rate
        const completionRate = totalAssigned > 0 
            ? Math.round((completedCount / totalAssigned) * 100) 
            : 0;

        // Total Transaction (Revenue)
        const revenueAgg = await Task.aggregate([
            { $match: { assignedTasker: tasker._id, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$budget' } } }
        ]);
        const totalTransaction = revenueAgg[0]?.total || 0;

        // 4. Fetch Recent Reviews (FROM TASKS)
        // We look for completed tasks that have a 'rating' field
        const recentReviews = await Task.find({ 
                assignedTasker: tasker._id, 
                status: 'completed',
                rating: { $exists: true } // Only fetch tasks that have been rated
            })
            .populate('user', 'fullName profilePicture') // Get the reviewer (Client) details
            .select('rating reviewText createdAt user') // Ensure your Task model has these fields!
            .sort({ createdAt: -1 })
            .limit(5);

        // Format reviews for UI
        const reviewsFormatted = recentReviews.map(r => ({
            id: r._id,
            reviewerName: r.user?.fullName || 'Anonymous',
            reviewerImage: r.user?.profilePicture || '',
            rating: r.rating || 0,
            comment: r.reviewText || 'No comment provided',
            date: r.createdAt
        }));

        res.json({
            status: 'success',
            data: {
                // Section 1: KYC
                kyc: {
                    type: kycRecord?.idType || 'N/A',
                    number: kycRecord?.idNumber || 'Not Submitted',
                    status: kycRecord?.status || 'unverified'
                },

                // Section 2: Statistics
                stats: {
                    rating: tasker.averageRating || 0,
                    completionRate: `${completionRate}%`,
                    completedTasks: completedCount,
                    totalTransaction, 
                    currentBalance: tasker.wallet || 0 
                },

                // Section 3: Account Info
                account: {
                    userId: tasker._id,
                    role: 'Tasker',
                    fullName: `${tasker.firstName} ${tasker.lastName}`,
                    lastUpdated: tasker.updatedAt
                },

                // Section 4: Categories
                categories: tasker.categories.map(c => c.name),

                // Section 5: Recent Reviews
                reviews: reviewsFormatted
            }
        });

    } catch (error) {
        console.error('Get tasker details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch tasker details' });
    }
};

// ACTIONS
export const verifyTasker = async (req, res) => {
    try {
        const tasker = await Tasker.findByIdAndUpdate(req.params.id, { verifyIdentity: true }, { new: true }); // Fixed: verifyIdentity
        if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
        
        await logAdminAction({ 
            adminId: req.admin._id, 
            action: 'VERIFY_TASKER', 
            resourceType: 'Tasker', 
            resourceId: tasker._id, 
            req 
        });
        
        res.json({ status: 'success', message: 'Tasker verified' });
    } catch (error) { res.status(500).json({ status: 'error', message: 'Failed to verify' }); }
};

export const suspendTasker = async (req, res) => {
    try {
        const tasker = await Tasker.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
        
        await logAdminAction({ 
            adminId: req.admin._id, 
            action: 'SUSPEND_TASKER', 
            resourceType: 'Tasker', 
            resourceId: tasker._id, 
            req 
        });
        
        res.json({ status: 'success', message: 'Tasker suspended' });
    } catch (error) { res.status(500).json({ status: 'error', message: 'Failed to suspend' }); }
};

export const activateTasker = async (req, res) => {
    try {
        const tasker = await Tasker.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
        if (!tasker) return res.status(404).json({ message: 'Tasker not found' });
        
        await logAdminAction({ 
            adminId: req.admin._id, 
            action: 'ACTIVATE_TASKER', 
            resourceType: 'Tasker', 
            resourceId: tasker._id, 
            req 
        });
        
        res.json({ status: 'success', message: 'Tasker activated' });
    } catch (error) { res.status(500).json({ status: 'error', message: 'Failed to activate' }); }
};