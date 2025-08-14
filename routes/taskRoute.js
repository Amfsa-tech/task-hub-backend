import { Router } from 'express';
import { createTask, getAllTasks, getTaskById, updateTask, deleteTask, getUserTasks, changeTaskStatus, getTaskerFeed } from '../controllers/task-controller.js';
import { protectUser, protectTasker } from '../middlewares/authMiddleware.js';

const router = Router();

// Public routes
router.get('/', getAllTasks);

// Tasker protected routes (place before dynamic :id route)
router.get('/tasker/feed', protectTasker, getTaskerFeed);

// User protected routes (place before dynamic :id route)
router.get('/user/tasks', protectUser, getUserTasks);
router.post('/', protectUser, createTask);
router.put('/:id', protectUser, updateTask);
router.delete('/:id', protectUser, deleteTask);

// Dynamic route for getting a specific task must come after more specific routes
router.get('/:id', getTaskById);

// Task status routes
router.patch('/:id/status', protectUser, changeTaskStatus); // For user to cancel task
router.patch('/:id/status/tasker', protectTasker, changeTaskStatus); // For tasker to update status

export default router; 