import { Router } from 'express';
import { protectAny } from '../middlewares/authMiddleware.js';
import {
  createOrGetConversation,
  listConversations,
  getConversation,
  listMessages,
  sendMessage,
  markRead,
  listMessageNotifications,
  updatePresence,
} from '../controllers/chat-controller.js';
import { uploadChatAttachments, handleMulterError } from '../middlewares/uploadMiddleware.js';

const router = Router();

router.get('/notifications', protectAny, listMessageNotifications);
router.patch('/presence', protectAny, updatePresence);
router.post('/conversations', protectAny, createOrGetConversation);
router.get('/conversations', protectAny, listConversations);
router.get('/conversations/:id', protectAny, getConversation);
router.get('/conversations/:id/messages', protectAny, listMessages);
router.post('/conversations/:id/messages', protectAny, uploadChatAttachments, handleMulterError, sendMessage);
router.post('/conversations/:id/read', protectAny, markRead);

export default router;
