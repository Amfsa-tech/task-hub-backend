import { Router } from 'express';
import * as Sentry from '@sentry/node';
import University from '../models/university.js';

const router = Router();

// Public: get all active universities
router.get('/', async (req, res) => {
    try {
        const universities = await University.find({ isActive: true })
            .select('_id name abbreviation state location logo')
            .sort({ name: 1 });

        res.status(200).json({
            status: 'success',
            count: universities.length,
            universities
        });
    } catch (error) {
        console.error('Error fetching universities:', error);
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Error fetching universities' });
    }
});

export default router;
