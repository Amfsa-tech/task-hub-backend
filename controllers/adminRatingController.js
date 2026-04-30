import Task from '../models/task.js';
import Tasker from '../models/tasker.js';
import User from '../models/user.js';
import { Types } from 'mongoose';
import * as Sentry from '@sentry/node';
import { logAdminAction } from '../utils/auditLogger.js';
import { escapeRegex } from '../utils/searchUtils.js';

// Helper function to check if ID is valid
const isValidObjectId = (id) => {
    return Types.ObjectId.isValid(id);
};

/**
 * GET /api/admin/reviews
 * Admin endpoint to view all ratings with filtering, sorting, and pagination
 * Filters: rating, date range, search by reviewer/tasker name
 * Supports: page, limit, rating, startDate, endDate, search, sortBy
 */
export const getAllReviews = async (req, res) => {
    try {
        const { page = 1, limit = 10, rating, startDate, endDate, search, sortBy = '-ratedAt' } = req.query;

        const filter = {
            status: 'completed',
            rating: { $exists: true }
            // Note: $ne: true includes both false and undefined (unhidden reviews)
        };

        // Filter by rating value (e.g., ?rating=5 or ?rating=1,2,3)
        if (rating) {
            const ratings = rating.split(',').map(r => parseInt(r)).filter(r => r >= 1 && r <= 5);
            if (ratings.length > 0) {
                filter.rating = { $in: ratings };
            }
        }

        // Filter by date range
        if (startDate || endDate) {
            filter.ratedAt = {};
            if (startDate) filter.ratedAt.$gte = new Date(startDate);
            if (endDate) filter.ratedAt.$lte = new Date(endDate);
        }

        // Search by reviewer name, tasker name, or review text
        if (search) {
            const escaped = escapeRegex(search);
            // We need to do this with aggregation for better search across related documents
        }

        const pageNum = Math.max(parseInt(page) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
        const skip = (pageNum - 1) * limitNum;

        // Build base aggregation pipeline
        let pipeline = [
            { $match: filter },
            {
                $lookup: {
                    from: 'taskers',
                    localField: 'assignedTasker',
                    foreignField: '_id',
                    as: 'tasker'
                }
            },
            { $unwind: { path: '$tasker', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'reviewer'
                }
            },
            { $unwind: { path: '$reviewer', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'mainCategory',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }
        ];

        // Add search filter if provided (now we have reviewer and tasker info)
        if (search) {
            const escaped = escapeRegex(search);
            pipeline.push({
                $match: {
                    $or: [
                        { 'reviewer.fullName': { $regex: escaped, $options: 'i' } },
                        { 'tasker.firstName': { $regex: escaped, $options: 'i' } },
                        { 'tasker.lastName': { $regex: escaped, $options: 'i' } },
                        { 'reviewText': { $regex: escaped, $options: 'i' } }
                    ]
                }
            });
        }

        // Sort
        const sortObj = {};
        if (sortBy === '-ratedAt') sortObj.ratedAt = -1;
        else if (sortBy === 'ratedAt') sortObj.ratedAt = 1;
        else if (sortBy === '-rating') sortObj.rating = -1;
        else if (sortBy === 'rating') sortObj.rating = 1;
        else sortObj.ratedAt = -1; // default

        pipeline.push({ $sort: sortObj });

        // Count total before pagination
        const countPipeline = [...pipeline, { $count: 'total' }];
        const countResult = await Task.aggregate(countPipeline);
        const total = countResult[0]?.total || 0;

        // Add pagination
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limitNum });

        // Project only necessary fields
        pipeline.push({
            $project: {
                _id: 1,
                title: 1,
                rating: 1,
                reviewText: 1,
                ratedAt: 1,
                isReviewHidden: 1,
                createdAt: 1,
                'reviewer._id': 1,
                'reviewer.fullName': 1,
                'reviewer.profilePicture': 1,
                'tasker._id': 1,
                'tasker.firstName': 1,
                'tasker.lastName': 1,
                'tasker.profilePicture': 1,
                'tasker.averageRating': 1,
                'category.name': 1,
                'category.displayName': 1
            }
        });

        const reviews = await Task.aggregate(pipeline);

        const totalPages = Math.ceil(total / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;

        // Transform response
        const formattedReviews = reviews.map(review => ({
            taskId: review._id,
            taskTitle: review.title,
            taskCategory: review.category?.displayName || review.category?.name,
            rating: review.rating,
            reviewText: review.reviewText,
            ratedAt: review.ratedAt,
            isHidden: review.isReviewHidden || false,
            reviewer: {
                id: review.reviewer?._id,
                name: review.reviewer?.fullName || 'Anonymous',
                profilePicture: review.reviewer?.profilePicture
            },
            tasker: {
                id: review.tasker?._id,
                name: (review.tasker?.firstName || '') + ' ' + (review.tasker?.lastName || ''),
                profilePicture: review.tasker?.profilePicture,
                averageRating: review.tasker?.averageRating || 0
            }
        }));

        res.json({
            status: 'success',
            message: 'Reviews retrieved successfully',
            data: {
                reviews: formattedReviews,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            }
        });
    } catch (error) {
        console.error('Get all reviews error:', error);
        Sentry.captureException(error);
        res.status(500).json({
            status: 'error',
            message: 'Error retrieving reviews',
            error: error.message
        });
    }
};

/**
 * PATCH /api/admin/reviews/:taskId/hide
 * Admin endpoint to hide an inappropriate review
 * Sets isReviewHidden = true and recalculates tasker average rating
 */
export const hideReview = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { reason } = req.body;

        if (!isValidObjectId(taskId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid task ID format'
            });
        }

        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({
                status: 'error',
                message: 'Task not found'
            });
        }

        if (!task.rating) {
            return res.status(400).json({
                status: 'error',
                message: 'Task has no rating to hide'
            });
        }

        if (task.isReviewHidden) {
            return res.status(400).json({
                status: 'error',
                message: 'Review is already hidden'
            });
        }

        // Hide the review
        task.isReviewHidden = true;
        await task.save();

        // Recalculate tasker's average rating
        if (task.assignedTasker) {
            const ratingAgg = await Task.aggregate([
                {
                    $match: {
                        assignedTasker: task.assignedTasker,
                        status: 'completed',
                        rating: { $exists: true },
                        isReviewHidden: { $ne: true }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avg: { $avg: '$rating' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            const newAverage = ratingAgg[0]?.avg || 0;
            await Tasker.updateOne(
                { _id: task.assignedTasker },
                { averageRating: Number(newAverage.toFixed(2)) }
            );
        }

        // Log admin action
        await logAdminAction(req.admin._id, 'HIDE_REVIEW', {
            taskId: task._id,
            reason: reason || 'Not specified'
        });

        res.json({
            status: 'success',
            message: 'Review hidden successfully',
            data: {
                taskId: task._id,
                isHidden: true,
                newTaskerAverage: task.assignedTasker ? (await Tasker.findById(task.assignedTasker)).averageRating : 0
            }
        });
    } catch (error) {
        console.error('Hide review error:', error);
        Sentry.captureException(error);
        res.status(500).json({
            status: 'error',
            message: 'Error hiding review',
            error: error.message
        });
    }
};

/**
 * PATCH /api/admin/reviews/:taskId/unhide
 * Admin endpoint to restore a hidden review
 * Sets isReviewHidden = false and recalculates tasker average rating
 */
export const unhideReview = async (req, res) => {
    try {
        const { taskId } = req.params;

        if (!isValidObjectId(taskId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid task ID format'
            });
        }

        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({
                status: 'error',
                message: 'Task not found'
            });
        }

        if (!task.rating) {
            return res.status(400).json({
                status: 'error',
                message: 'Task has no rating to unhide'
            });
        }

        if (!task.isReviewHidden) {
            return res.status(400).json({
                status: 'error',
                message: 'Review is not hidden'
            });
        }

        // Unhide the review
        task.isReviewHidden = false;
        await task.save();

        // Recalculate tasker's average rating
        if (task.assignedTasker) {
            const ratingAgg = await Task.aggregate([
                {
                    $match: {
                        assignedTasker: task.assignedTasker,
                        status: 'completed',
                        rating: { $exists: true },
                        isReviewHidden: { $ne: true }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avg: { $avg: '$rating' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            const newAverage = ratingAgg[0]?.avg || 0;
            await Tasker.updateOne(
                { _id: task.assignedTasker },
                { averageRating: Number(newAverage.toFixed(2)) }
            );
        }

        // Log admin action
        await logAdminAction(req.admin._id, 'UNHIDE_REVIEW', {
            taskId: task._id
        });

        res.json({
            status: 'success',
            message: 'Review unhidden successfully',
            data: {
                taskId: task._id,
                isHidden: false,
                newTaskerAverage: task.assignedTasker ? (await Tasker.findById(task.assignedTasker)).averageRating : 0
            }
        });
    } catch (error) {
        console.error('Unhide review error:', error);
        Sentry.captureException(error);
        res.status(500).json({
            status: 'error',
            message: 'Error unhiding review',
            error: error.message
        });
    }
};
