import express from 'express';
import { protectAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// ✅ TEST ROUTE
router.get('/test', protectAdmin, (req, res) => {
    res.status(200).json({
        message: 'Admin access confirmed',
        admin: {
            id: req.admin._id,
            email: req.admin.email,
            role: req.admin.role
        }
    });
});

export default router;
