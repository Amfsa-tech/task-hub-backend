import { Router } from 'express';
import { createTask, getAllTasks, getTaskById, updateTask, deleteTask, getUserTasks, changeTaskStatus, getTaskerFeed } from '../controllers/task-controller.js';
import { protectUser, protectTasker } from '../middlewares/authMiddleware.js';

const router = Router();

// Public routes
router.get('/', getAllTasks);
router.get('/:id', getTaskById);

// User protected routes
router.post('/', protectUser, createTask);
router.put('/:id', protectUser, updateTask);
router.delete('/:id', protectUser, deleteTask);
router.get('/user/tasks', protectUser, getUserTasks);

// Tasker protected routes
router.get('/tasker/feed', protectTasker, getTaskerFeed);

// Task status routes
router.patch('/:id/status', protectUser, changeTaskStatus); // For user to cancel task
router.patch('/:id/status/tasker', protectTasker, changeTaskStatus); // For tasker to update status

export default router; 