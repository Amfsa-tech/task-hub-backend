import Task from '../models/task.js';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import { logAdminAction } from '../utils/auditLogger.js';
import mongoose from 'mongoose';
import Bid from '../models/bid.js'
import { escapeRegex } from '../utils/searchUtils.js';
import * as Sentry from '@sentry/node';

// --- NEW: GET /api/admin/tasks/stats (For the 5 Top Cards) ---
export const getTaskStats = async (req, res) => {
    try {
        const [
            totalTasks,
            openTasks,
            inProgressTasks,
            completedTasks,
            cancelledTasks
        ] = await Promise.all([
            Task.countDocuments(),
            Task.countDocuments({ status: 'open' }),
            Task.countDocuments({ status: 'in-progress' }),
            Task.countDocuments({ status: 'completed' }),
            Task.countDocuments({ status: 'cancelled' })
        ]);

        res.json({
            status: 'success',
            data: {
                total: totalTasks,
                open: openTasks,
                inProgress: inProgressTasks,
                completed: completedTasks,
                cancelled: cancelledTasks
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Task stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch task stats' });
    }
};

// --- UPGRADED: GET /api/admin/tasks ---
// Added: Search by User Name/Email + Category Population
export const getAllTasks = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;

        const filter = {};

        // 1. Status Filter (Handle "All" tab from UI)
        if (status && status !== 'All') {
            filter.status = status.toLowerCase();
        }

        // 2. Advanced Search (Title OR User Name OR User Email)
        if (search) {
            const escaped = escapeRegex(search);
            // First, find users matching the search term
            const matchingUsers = await User.find({
                $or: [
                    { fullName: { $regex: escaped, $options: 'i' } },
                    { emailAddress: { $regex: escaped, $options: 'i' } } // Matches your User model field
                ]
            }).select('_id');

            const matchingUserIds = matchingUsers.map(u => u._id);

            // Filter tasks that match Title OR belong to those users
            filter.$or = [
                { title: { $regex: escaped, $options: 'i' } },
                { user: { $in: matchingUserIds } }
            ];
        }

        // 3. Date Range Filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // 4. Execute Query
        const tasks = await Task.find(filter)
            .populate('user', 'fullName emailAddress profilePicture') // Added profilePicture for UI
            .populate('assignedTasker', 'firstName lastName emailAddress')
            .populate('mainCategory', 'name')
            .populate('subCategory', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Task.countDocuments(filter);

        res.json({
            status: 'success',
            results: tasks.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            tasks
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Admin get tasks error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch tasks'
        });
    }
};

// ... (Your existing functions kept exactly as is below) ...

// GET /api/admin/tasks/:id
export const getTaskById = async (req, res) => {
    try {
        const taskId = req.params.id;

        // 1. Fetch Task Details
        const task = await Task.findById(taskId)
            .populate('user', 'fullName emailAddress profilePicture phone') 
            .populate('assignedTasker', 'firstName lastName emailAddress profilePicture phone') 
            .populate('mainCategory', 'name')
            .populate('subCategory', 'name');

        if (!task) {
            return res.status(404).json({ status: 'error', message: 'Task not found' });
        }

        // 2. Fetch Bids (Safe check if Bid model exists, if not return empty array)
        // If you haven't created the Bid model yet, comment out the Bid lines below
        let bids = [];
        try {
            const Bid = (await import('../models/bid.js')).default;
            bids = await Bid.find({ task: taskId })
                .populate('tasker', 'firstName lastName profilePicture emailAddress')
                .sort({ createdAt: -1 });
        } catch (e) {
            console.log("Bid model not found or error fetching bids, skipping...");
        }

        // 3. Construct Response
        res.json({
            status: 'success',
            data: {
                task: {
                    _id: task._id,
                    title: task.title,
                    description: task.description,
                    budget: task.budget,
                    status: task.status,
                    negotiable: task.budgetType === 'negotiable' ? 'YES' : 'NO',
                    
                    // --- THE FIX IS HERE ---
                    // We use '?.' to check if mainCategory exists
                    category: task.mainCategory?.name || 'General', 
                    // -----------------------

                    createdAt: task.createdAt,
                    deadline: task.date, 
                    lastUpdated: task.updatedAt,
                    postedBy: task.user, 
                    assignedTo: task.assignedTasker || null
                },
                bids: bids.map(bid => ({
                    id: bid._id,
                    amount: bid.amount,
                    message: bid.message || '',
                    status: bid.status,
                    bidType: bid.bidType,
                    date: bid.createdAt,
                    taskerName: bid.tasker ? `${bid.tasker.firstName} ${bid.tasker.lastName}` : 'Unknown',
                    taskerImage: bid.tasker?.profilePicture,
                    taskerEmail: bid.tasker?.emailAddress
                }))
            }
        });

    } catch (error) {
        Sentry.captureException(error);
        console.error('Get task details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch task details' });
    }
};

export const forceCancelTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);

        if (!task) {
            return res.status(404).json({
                status: 'error',
                message: 'Task not found'
            });
        }

        const update = {
            status: 'cancelled'
        };

        // If escrow was held, mark refund requested
        if (task.isEscrowHeld) {
            update.escrowStatus = 'refund_requested';
            update.isEscrowHeld = false;
        }

        await Task.findByIdAndUpdate(
            task._id,
            update,
            { runValidators: true }
        );

        await logAdminAction({
            adminId: req.admin._id,
            action: 'FORCE_CANCEL_TASK',
            resourceType: 'Task',
            resourceId: task._id,
            req
        });

        res.json({
            status: 'success',
            message: 'Task cancelled by admin'
        });
Sentry.captureException(error);
        
    } catch (error) {
        console.error('Cancel task failed:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

export const forceCompleteTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);

        if (!task) {
            return res.status(404).json({
                status: 'error',
                message: 'Task not found'
            });
        }

        const update = { status: 'completed' };
        if (task.isEscrowHeld) {
            update.escrowStatus = 'released';
            update.isEscrowHeld = false;
        }
        
        await Task.findByIdAndUpdate(
            req.params.id,
            update,
            { runValidators: true }
        );
        
        await logAdminAction({
            adminId: req.admin._id,
            action: 'FORCE_COMPLETE_TASK',
            resourceType: 'Task',
            resourceId: task._id,
            req
        });

        res.json({
            status: 'success',
            message: 'Task force completed by admin'
        });

    } catch (error) {
        console.error('SAVE FAILED:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};