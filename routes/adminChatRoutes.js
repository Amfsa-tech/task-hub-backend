import express from 'express';
import { protectAdmin } from '../middlewares/adminMiddleware.js';
import { 
    getAllConversations, 
    getChatHistory, 
    sendAdminMessage 
} from '../controllers/adminChatController.js';

const router = express.Router();

router.use(protectAdmin);

router.get('/', getAllConversations);
router.get('/:id', getChatHistory); // :id is the Conversation ID
router.post('/:id', sendAdminMessage);

export default router;