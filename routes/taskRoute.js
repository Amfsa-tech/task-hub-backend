import { Router } from 'express';
import { createTask, getAllTasks, getTaskById, updateTask, deleteTask, getUserTasks, changeTaskStatus, getTaskerFeed, getCompletionCode, getTaskerTasks } from '../controllers/task-controller.js';
import { protectUser, protectTasker } from '../middlewares/authMiddleware.js';
import { uploadTaskImages, handleMulterError } from '../middlewares/uploadMiddleware.js';

const router = Router();

// Public routes
router.get('/', getAllTasks);

// Tasker protected routes (place before dynamic :id route)
router.get('/tasker/feed', protectTasker, getTaskerFeed);
router.get('/tasker/tasks', protectTasker, getTaskerTasks);

// User protected routes (place before dynamic :id route)
router.get('/user/tasks', protectUser, getUserTasks);
router.post('/', protectUser, uploadTaskImages, handleMulterError, createTask);
router.put('/:id', protectUser, uploadTaskImages, handleMulterError, updateTask);
router.delete('/:id', protectUser, deleteTask);

// Dynamic route for getting a specific task must come after more specific routes
router.get('/:id', getTaskById);

// Completion code route (user/task poster only)
router.get('/:id/completion-code', protectUser, getCompletionCode);

// Task status routes
router.patch('/:id/status', protectUser, changeTaskStatus); // For user to cancel task
router.patch('/:id/status/tasker', protectTasker, changeTaskStatus); // For tasker to update status

export default router; 