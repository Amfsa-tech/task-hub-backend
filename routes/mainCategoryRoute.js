import { Router } from 'express';
import MainCategory from '../models/mainCategory.js';

const router = Router();

// Public: get all active main categories
router.get('/', async (req, res) => {
    try {
        const mainCategories = await MainCategory.find({ isActive: true })
            .select('_id name displayName description icon')
            .sort({ displayName: 1 });

        res.status(200).json({
            status: 'success',
            count: mainCategories.length,
            mainCategories
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Error fetching main categories' });
    }
});

export default router;
