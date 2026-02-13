import Conversation from '../models/conversation.js';
import Message from '../models/message.js'; 

// GET /api/admin/messages?page=1&limit=20
export const getAllConversations = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const skip = (page - 1) * limit;

        // 1. Build Query
        // (Note: Searching inside populated fields like user.firstName is complex in Mongo.
        // For V1, we will just fetch recent conversations. If search is needed, 
        // we'd need an aggregation pipeline.)
        const query = {}; 

        // 2. Fetch Conversations
        const conversations = await Conversation.find(query)
            .populate('user', 'fullName email')       // Get Client details
            .populate('tasker', 'firstName lastName email') // Get Tasker details
            .populate('task', 'title status')         // Get Task context
            .sort({ updatedAt: -1 })                  // Most active first
            .limit(limit * 1)
            .skip(skip);

        const total = await Conversation.countDocuments(query);

        res.json({
            status: 'success',
            results: conversations.length,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            conversations
        });

    } catch (error) {
        console.error('Fetch conversations error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch conversations' });
    }
};

// GET /api/admin/messages/:id (Fetch history for one conversation)
export const getChatHistory = async (req, res) => {
    try {
        const conversationId = req.params.id;

        const messages = await Message.find({ conversation: conversationId })
            .populate('senderUser', 'fullName email')      // If sender was User
            .populate('senderTasker', 'firstName lastName') // If sender was Tasker
            .sort({ createdAt: 1 }); // Oldest to Newest

        res.json({
            status: 'success',
            messages
        });

    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch messages' });
    }
};

// POST /api/admin/messages/:id (Admin replies as "System")
export const sendAdminMessage = async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { text } = req.body;

        if (!text) return res.status(400).json({ message: 'Message text is required' });

        // 1. Create the Message
        // We use 'system' type because your schema supports it.
        // This avoids needing a new 'senderAdmin' field.
        const newMessage = await Message.create({
            conversation: conversationId,
            senderType: 'system', 
            text: `[Admin Support]: ${text}`, // Prefix to make it clear
            status: 'sent'
        });

        // 2. Update Conversation (Last Message)
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: `[Admin]: ${text}`,
            lastMessageAt: new Date()
            // Optional: You could increment unread.user or unread.tasker here 
            // if you want to notify them.
        });

        res.status(201).json({
            status: 'success',
            data: newMessage
        });

    } catch (error) {
        console.error('Send admin message error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send message' });
    }
};