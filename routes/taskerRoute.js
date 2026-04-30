import { Router } from 'express';
import { getTaskerReviews } from '../controllers/tasker-controller.js';

const router = Router();

/**
 * Public endpoint to get reviews/ratings for a specific tasker
 * GET /api/taskers/:id/reviews
 * Query params: page, limit
 */
router.get('/:id/reviews', getTaskerReviews);

export default router;
