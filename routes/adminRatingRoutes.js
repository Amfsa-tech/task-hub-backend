import { Router } from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { getAllReviews, hideReview, unhideReview } from '../controllers/adminRatingController.js';

const router = Router();

// All routes are admin-protected
router.use(protectAdmin);

/**
 * GET /api/admin/ratings
 * View all ratings with filtering, sorting, and pagination
 * Query params: page, limit, rating, startDate, endDate, search, sortBy
 */
router.get('/', getAllReviews);

/**
 * PATCH /api/admin/ratings/:taskId/hide
 * Hide a review
 */
router.patch('/:taskId/hide', hideReview);

/**
 * PATCH /api/admin/ratings/:taskId/unhide
 * Unhide a review
 */
router.patch('/:taskId/unhide', unhideReview);

export default router;
