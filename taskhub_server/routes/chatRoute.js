import { Router } from 'express';
import { protectAny } from '../middlewares/authMiddleware.js';
import { createOrGetConversation, listConversations, getConversation, listMessages, sendMessage, markRead } from '../controllers/chat-controller.js';

const router = Router();

router.post('/conversations', protectAny, createOrGetConversation);
router.get('/conversations', protectAny, listConversations);
router.get('/conversations/:id', protectAny, getConversation);
router.get('/conversations/:id/messages', protectAny, listMessages);
router.post('/conversations/:id/messages', protectAny, sendMessage);
router.post('/conversations/:id/read', protectAny, markRead);

export default router;
