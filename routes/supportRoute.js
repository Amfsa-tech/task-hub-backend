import { Router } from 'express';
import { submitSupportRequest } from '../controllers/supportController.js';

const router = Router();

router.post('/', submitSupportRequest);

export default router;
