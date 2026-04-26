import Conversation from '../models/conversation.js';
import Message from '../models/message.js';
import * as Sentry from '@sentry/node';

// GET /api/admin/messages/stats
export const getChatStats = async (req, res) => {
    try {
        // Matches the 3 cards in image_885365.jpg
        const [totalConversations, totalMessages] = await Promise.all([
            Conversation.countDocuments(),
            Message.countDocuments()
        ]);

        // "Unread Messages" stat for Admin 
        // Based on your schema's unread object
        const unreadAgg = await Conversation.aggregate([
            { $group: { _id: null, total: { $sum: { $add: ["$unread.user", "$unread.tasker"] } } } }
        ]);
        const totalUnread = unreadAgg[0]?.total || 0;

        res.json({
            status: 'success',
            data: {
                totalConversations,
                totalMessages,
                totalUnread // For the third card
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch chat stats' });
    }
};

// GET /api/admin/messages (List View)
export const getAllConversations = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const conversations = await Conversation.find()
            .populate('user', 'fullName emailAddress profilePicture') 
            .populate('tasker', 'firstName lastName emailAddress profilePicture')
            .populate('task', 'title status')
            .sort({ updatedAt: -1 })
            .limit(limit * 1)
            .skip(skip);

        const total = await Conversation.countDocuments();

        res.json({
            status: 'success',
            results: conversations.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            conversations
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch conversations' });
    }
};

// GET /api/admin/messages/:id (Detailed View)
export const getChatHistory = async (req, res) => {
    try {
        const conversationId = req.params.id;

        // Fetch conversation info first to get context (Task, Participants)
        const details = await Conversation.findById(conversationId)
            .populate('user', 'fullName emailAddress profilePicture')
            .populate('tasker', 'firstName lastName emailAddress profilePicture')
            .populate('task', 'title budget status');

        if (!details) return res.status(404).json({ status: 'error', message: 'Chat not found' });

        const messages = await Message.find({ conversation: conversationId })
            .populate('senderUser', 'fullName profilePicture')
            .populate('senderTasker', 'firstName lastName profilePicture')
            .sort({ createdAt: 1 });

        res.json({
            status: 'success',
            data: {
                details,
                messages
            }
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch history' });
    }
};

// POST /api/admin/messages/:id (System Intervention)
export const sendAdminMessage = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ message: 'Message text is required' });

        const newMessage = await Message.create({
            conversation: req.params.id,
            senderType: 'system', 
            text: `[Admin Support]: ${text}`,
            status: 'sent'
        });

        await Conversation.findByIdAndUpdate(req.params.id, {
            lastMessage: `[Admin]: ${text}`,
            lastMessageAt: new Date()
        });

        res.status(201).json({ status: 'success', data: newMessage });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({ status: 'error', message: 'Failed to send message' });
    }
};