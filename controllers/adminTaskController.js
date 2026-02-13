import Task from '../models/task.js';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import { logAdminAction } from '../utils/auditLogger.js';
import mongoose from 'mongoose';
import Bid from '../models/bid.js'

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
            // First, find users matching the search term
            const matchingUsers = await User.find({
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { emailAddress: { $regex: search, $options: 'i' } } // Matches your User model field
                ]
            }).select('_id');

            const matchingUserIds = matchingUsers.map(u => u._id);

            // Filter tasks that match Title OR belong to those users
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
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
            .populate('categories', 'name') // <--- NEW: Populates the "CATEGORY" column
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
        console.error('Admin get tasks error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch tasks'
        });
    }
};

// ... (Your existing functions kept exactly as is below) ...

export const getTaskById = async (req, res) => {
    try {
        const taskId = req.params.id;

        // 1. Fetch Task Details
        const task = await Task.findById(taskId)
            .populate('user', 'fullName emailAddress profilePicture phone') 
            .populate('assignedTasker', 'firstName lastName emailAddress profilePicture phone') 
            .populate('categories', 'name');

        if (!task) {
            return res.status(404).json({ status: 'error', message: 'Task not found' });
        }

        // 2. Fetch Bids (Using your specific Bid model structure)
        const bids = await Bid.find({ task: taskId })
            .populate('tasker', 'firstName lastName profilePicture emailAddress') // Get Tasker details
            .sort({ createdAt: -1 }); // Newest bids first

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
                    category: task.categories[0]?.name || 'General',
                    createdAt: task.createdAt,
                    deadline: task.date, // or task.deadline depending on your Task model
                    lastUpdated: task.updatedAt,
                    postedBy: task.user, 
                    assignedTo: task.assignedTasker || null
                },
                // 4. Map Bids to UI (Matches your Bid model fields)
                bids: bids.map(bid => ({
                    id: bid._id,
                    amount: bid.amount,          // Matches 'amount' in your Schema
                    message: bid.message || '',  // Matches 'message' in your Schema
                    status: bid.status,          // 'pending', 'accepted', etc.
                    bidType: bid.bidType,        // 'fixed' or 'custom'
                    date: bid.createdAt,
                    taskerName: `${bid.tasker.firstName} ${bid.tasker.lastName}`,
                    taskerImage: bid.tasker.profilePicture,
                    taskerEmail: bid.tasker.emailAddress
                }))
            }
        });

    } catch (error) {
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

        if (task.isEscrowHeld) {
            task.escrowStatus = 'released';
        }
        
        await Task.findByIdAndUpdate(
            req.params.id,
            {
                status: 'completed',
                escrowStatus: task.isEscrowHeld ? 'released' : 'held'
            },
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