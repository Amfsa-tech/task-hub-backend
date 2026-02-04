import Task from '../models/task.js';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import { logAdminAction } from '../utils/auditLogger.js';
import mongoose from 'mongoose';

// GET /api/admin/tasks
export const getAllTasks = async (req, res) => {
    try {
        const { status } = req.query;

        const filter = {};
        if (status) {
            filter.status = status;
        }

        const tasks = await Task.find(filter)
            .populate('user', 'fullName emailAddress')
            .populate('assignedTasker', 'firstName lastName emailAddress')
            .sort({ createdAt: -1 });

        res.json({
            status: 'success',
            count: tasks.length,
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

// GET /api/admin/tasks/:id
export const getTaskById = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('user', 'fullName emailAddress')
            .populate('assignedTasker', 'firstName lastName emailAddress')

        if (!task) {
            return res.status(404).json({
                status: 'error',
                message: 'Task not found'
            });
        }

        res.json({
            status: 'success',
            task
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch task'
        });
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

        // Ensure valid enum value
       

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

