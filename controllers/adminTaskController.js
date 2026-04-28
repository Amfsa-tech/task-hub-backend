import Task from '../models/task.js';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import { logAdminAction } from '../utils/auditLogger.js';
import mongoose from 'mongoose';
import Bid from '../models/bid.js';
import Transaction from '../models/transaction.js';
import { escapeRegex } from '../utils/searchUtils.js';
import { sendEmail, taskCancelledUserEmailHtml, taskCancelledTaskerEmailHtml } from '../services/emailService.js';

export const getTaskStats = async (req, res) => {
    try {
        const [totalTasks, openTasks, inProgressTasks, completedTasks, cancelledTasks] = await Promise.all([
            Task.countDocuments(), Task.countDocuments({ status: 'open' }), Task.countDocuments({ status: 'in-progress' }),
            Task.countDocuments({ status: 'completed' }), Task.countDocuments({ status: 'cancelled' })
        ]);

        res.json({
            status: 'success',
            data: { total: totalTasks, open: openTasks, inProgress: inProgressTasks, completed: completedTasks, cancelled: cancelledTasks }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('Task stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch task stats' });
    }
};

export const getAllTasks = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;
        const filter = {};

        if (status && status !== 'All') filter.status = status.toLowerCase();

        if (search) {
            const escaped = escapeRegex(search);
            const matchingUsers = await User.find({
                $or: [{ fullName: { $regex: escaped, $options: 'i' } }, { emailAddress: { $regex: escaped, $options: 'i' } }]
            }).select('_id');
            const matchingUserIds = matchingUsers.map(u => u._id);

            filter.$or = [{ title: { $regex: escaped, $options: 'i' } }, { user: { $in: matchingUserIds } }];
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        const tasks = await Task.find(filter)
            .populate('user', 'fullName emailAddress profilePicture') 
            .populate('assignedTasker', 'firstName lastName emailAddress')
            .populate('mainCategory', 'name')
            .populate('subCategory', 'name')
            .sort({ createdAt: -1 }).limit(limit * 1).skip((page - 1) * limit);

        const total = await Task.countDocuments(filter);

        res.json({
            status: 'success', results: tasks.length, totalRecords: total,
            totalPages: Math.ceil(total / limit), currentPage: Number(page), tasks
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

export const getTaskById = async (req, res) => {
    try {
        const taskId = req.params.id;
        const task = await Task.findById(taskId)
            .populate('user', 'fullName emailAddress profilePicture phone') 
            .populate('assignedTasker', 'firstName lastName emailAddress profilePicture phone') 
            .populate('mainCategory', 'name')
            .populate('subCategory', 'name');

        if (!task) return res.status(404).json({ status: 'error', message: 'Task not found' });

        let bids = [];
        try {
            bids = await Bid.find({ task: taskId }).populate('tasker', 'firstName lastName profilePicture emailAddress').sort({ createdAt: -1 });
        } catch (e) {}

        res.json({
            status: 'success',
            data: {
                task: {
                    _id: task._id, title: task.title, description: task.description, budget: task.budget,
                    status: task.status, negotiable: task.budgetType === 'negotiable' ? 'YES' : 'NO',
                    category: task.mainCategory?.name || 'General', createdAt: task.createdAt,
                    deadline: task.date, lastUpdated: task.updatedAt, postedBy: task.user, assignedTo: task.assignedTasker || null
                },
                bids: bids.map(bid => ({
                    id: bid._id, amount: bid.amount, message: bid.message || '', status: bid.status, bidType: bid.bidType,
                    date: bid.createdAt, taskerName: bid.tasker ? `${bid.tasker.firstName} ${bid.tasker.lastName}` : 'Unknown',
                    taskerImage: bid.tasker?.profilePicture, taskerEmail: bid.tasker?.emailAddress
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
        const { reason } = req.body; 
        
        // Fetch task without populating yet to avoid Mongoose save quirks
        const task = await Task.findById(req.params.id);

        if (!task) return res.status(404).json({ status: 'error', message: 'Task not found' });

        const update = { status: 'cancelled' };

        // 1. BULLETPROOF WALLET REFUND
        // We check if there is actual money to refund, ignoring the boolean just in case
        if (task.escrowAmount && task.escrowAmount > 0) {
            update.escrowStatus = 'refunded'; 
            update.isEscrowHeld = false;

            // Force Mongoose to increment the wallet directly in the DB
            await User.findByIdAndUpdate(task.user, {
                $inc: { wallet: task.escrowAmount }
            });

            // Create system refund transaction record
            await Transaction.create({
                user: task.user, 
                amount: task.escrowAmount, 
                type: 'credit',
                description: `Admin Refund: Cancelled task "${task.title}"`,
                status: 'success', 
                reference: `REF-${Date.now()}-${task._id.toString().substring(0, 5)}`,
                provider: 'system', 
                paymentPurpose: 'escrow_refund'
            });
        } else {
            // Even if no money was held, ensure the status updates correctly
            update.escrowStatus = 'refunded';
            update.isEscrowHeld = false;
        }

        // Apply task updates
        await Task.findByIdAndUpdate(task._id, update, { runValidators: true });

        // Fetch User details safely for the email
        const taskOwner = await User.findById(task.user);

        // 2. Send Email to the Task Owner (Employer)
        if (taskOwner && taskOwner.emailAddress) {
            const html = taskCancelledUserEmailHtml({
                userName: taskOwner.fullName,
                taskTitle: task.title,
                reason: reason || 'Violation of community guidelines'
            });
            await sendEmail({ to: taskOwner.emailAddress, subject: `Important: Your task "${task.title}" has been cancelled`, html });
        }

        // 3. Send Emails to ALL Taskers who bid on it
        const bids = await Bid.find({ task: task._id }).populate('tasker');
        if (bids.length > 0) {
            await Promise.all(bids.map(bid => {
                if (bid.tasker && bid.tasker.emailAddress) {
                    const html = taskCancelledTaskerEmailHtml({
                        taskerName: `${bid.tasker.firstName} ${bid.tasker.lastName}`,
                        taskTitle: task.title
                    });
                    return sendEmail({ to: bid.tasker.emailAddress, subject: `Update on your application for: ${task.title}`, html });
                }
            }));
            
            // Mark bids as rejected
            await Bid.updateMany({ task: task._id }, { status: 'rejected' });
        }

        await logAdminAction({ adminId: req.admin._id, action: 'FORCE_CANCEL_TASK', resourceType: 'Task', resourceId: task._id, req });

        res.json({ status: 'success', message: 'Task cancelled, refunded, and notifications sent.' });
    } catch (error) { 
        console.error("Force Cancel Error:", error);
        res.status(500).json({ status: 'error', message: error.message }); 
    }
};

export const forceCompleteTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ status: 'error', message: 'Task not found' });

        const update = { status: 'completed' };
        if (task.isEscrowHeld) {
            update.escrowStatus = 'released';
            update.isEscrowHeld = false;
        }
        
        await Task.findByIdAndUpdate(req.params.id, update, { runValidators: true });
        await logAdminAction({ adminId: req.admin._id, action: 'FORCE_COMPLETE_TASK', resourceType: 'Task', resourceId: task._id, req });

        res.json({ status: 'success', message: 'Task force completed by admin' });
    } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};