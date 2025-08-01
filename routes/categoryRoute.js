import { Router } from 'express';
import { createCategory, getAllCategories, getAllCategoriesAdmin, getCategoryById, updateCategory, deactivateCategory, getCategoryStats } from '../controllers/category-controller.js';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { protectUser } from '../middlewares/authMiddleware.js';

// Add admin middleware later for restricted operations

const router = Router();

// Public routes (no authentication required)
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

// Admin protected routes
router.get('/admin/all', protectUser, getAllCategoriesAdmin);
router.get('/admin/:id/stats', protectUser, getCategoryStats);
router.post('/admin', protectUser, createCategory);
router.put('/admin/:id', protectUser, updateCategory);
router.patch('/admin/:id/deactivate', protectUser, deactivateCategory);

export default router; 