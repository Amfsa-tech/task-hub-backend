import { Router } from 'express';
import { createBid, updateBid, deleteBid, getTaskBids, acceptBid, getTaskerBids, getBidById } from '../controllers/bid-controller.js';
import { protectUser, protectTasker } from '../middlewares/authMiddleware.js';

const router = Router();

// Tasker bid routes
router.post('/', protectTasker, createBid);
router.put('/:id', protectTasker, updateBid);
router.delete('/:id', protectTasker, deleteBid);
router.get('/tasker/bids', protectTasker, getTaskerBids);

// User bid routes
router.get('/task/:taskId', protectUser, getTaskBids);
router.post('/:id/accept', protectUser, acceptBid);

// Both user and tasker can view a specific bid (if authorized)
router.get('/:id', protectUser, getBidById); // This will work for taskers too due to the bid ownership check

export default router; 