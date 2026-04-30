import Tasker from '../models/tasker.js';
import Task from '../models/task.js';
import User from '../models/user.js';
import { Types } from 'mongoose';
import * as Sentry from '@sentry/node';

// Helper function to check if ID is valid
const isValidObjectId = (id) => {
    return Types.ObjectId.isValid(id);
};

/**
 * Get all reviews/ratings for a tasker
 * Public endpoint - no authentication required
 * GET /api/taskers/:id/reviews
 * Query params: page, limit
 */
const getTaskerReviews = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid tasker ID format'
            });
        }

        // Verify tasker exists
        const tasker = await Tasker.findById(id);
        if (!tasker) {
            return res.status(404).json({
                status: 'error',
                message: 'Tasker not found'
            });
        }

        // Pagination parameters
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;

        // Query: completed tasks assigned to this tasker with ratings (not hidden)
        const ratedTasks = await Task.find({
            assignedTasker: id,
            status: 'completed',
            rating: { $exists: true },
            isReviewHidden: { $ne: true }
        })
            .populate('user', 'fullName profilePicture')
            .select('rating reviewText ratedAt mainCategory _id title user')
            .sort({ ratedAt: -1 })
            .limit(limit)
            .skip(skip);

        // Get total count for pagination
        const total = await Task.countDocuments({
            assignedTasker: id,
            status: 'completed',
            rating: { $exists: true },
            isReviewHidden: { $ne: true }
        });

        // Transform response to match expected shape
        const reviews = ratedTasks.map(task => ({
            taskId: task._id,
            taskTitle: task.title,
            taskCategory: task.mainCategory?.name || task.mainCategory?.displayName || null,
            rating: task.rating,
            reviewText: task.reviewText || null,
            ratedAt: task.ratedAt,
            reviewer: {
                name: task.user?.fullName || 'Anonymous',
                profilePicture: task.user?.profilePicture || null
            }
        }));

        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        return res.json({
            status: 'success',
            message: 'Tasker reviews retrieved successfully',
            data: {
                taskerId: id,
                taskerName: tasker.firstName + ' ' + tasker.lastName,
                taskerProfilePicture: tasker.profilePicture || null,
                taskerAverageRating: tasker.averageRating || 0,
                reviews,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            }
        });
    } catch (error) {
        console.error('Get tasker reviews error:', error);
        Sentry.captureException(error);
        res.status(500).json({
            status: 'error',
            message: 'Error retrieving tasker reviews',
            error: error.message
        });
    }
};

export { getTaskerReviews };
