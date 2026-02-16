import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { 
    getAllConversations, 
    getChatHistory, 
    sendAdminMessage 
} from '../controllers/adminChatController.js';

const router = express.Router();

router.use(protectAdmin);
router.get('/stats', getChatStats); // Add this at the top
router.get('/', getAllConversations);
router.get('/:id', getChatHistory);
router.post('/:id', sendAdminMessage);

export default router;