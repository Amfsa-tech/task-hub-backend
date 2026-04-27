import Conversation from '../models/conversation.js';
import Message from '../models/message.js';
import Task from '../models/task.js';
import Bid from '../models/bid.js';
import { Types } from 'mongoose';
import * as Sentry from '@sentry/node';
import { notifyOnNewChatMessage } from '../utils/notificationUtils.js';
import { uploadMultipleToCloudinary } from '../utils/uploadService.js';

const isValidId = (id) => Types.ObjectId.isValid(id);

// Ensure the current principal is a participant in the conversation
// Handles both populated (full document) and unpopulated (ObjectId) fields
const ensureParticipant = (conversation, req) => {
  const id = req.user._id.toString();
  if (req.userType === 'user') {
    const convUserId = conversation.user._id ? conversation.user._id.toString() : conversation.user.toString();
    return convUserId === id;
  } else {
    const convTaskerId = conversation.tasker._id ? conversation.tasker._id.toString() : conversation.tasker.toString();
    return convTaskerId === id;
  }
};

// Create or get conversation for a task owner and a bidding tasker
export const createOrGetConversation = async (req, res) => {
  try {
    const { taskId, bidId, taskerId } = req.body || {};

    if (!taskId || !isValidId(taskId)) {
      return res.status(400).json({ status: 'error', message: 'Valid taskId is required' });
    }

    const task = await Task.findById(taskId).select('user');
    if (!task) {
      return res.status(404).json({ status: 'error', message: 'Task not found' });
    }

    let userId;
    let participantTaskerId;
    let resolvedBidId = null;

    if (req.userType === 'user') {
      // Must be the task owner
      if (task.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({ status: 'error', message: 'Not authorized for this task' });
      }
      userId = req.user._id;

      if (bidId) {
        if (!isValidId(bidId)) return res.status(400).json({ status: 'error', message: 'Invalid bidId' });
        const bid = await Bid.findById(bidId).select('task tasker');
        if (!bid || bid.task.toString() !== taskId) {
          return res.status(400).json({ status: 'error', message: 'Bid not found for this task' });
        }
        participantTaskerId = bid.tasker;
        resolvedBidId = bid._id;
      } else if (taskerId) {
        if (!isValidId(taskerId)) return res.status(400).json({ status: 'error', message: 'Invalid taskerId' });
        const hasBid = await Bid.exists({ task: taskId, tasker: taskerId });
        if (!hasBid) {
          return res.status(400).json({ status: 'error', message: 'Tasker has not applied for this task' });
        }
        participantTaskerId = taskerId;
      } else {
        return res.status(400).json({ status: 'error', message: 'Provide bidId or taskerId' });
      }
    } else {
      // Tasker
      userId = task.user;
      const bidder = await Bid.findOne({ task: taskId, tasker: req.user._id }).select('_id');
      if (!bidder) {
        return res.status(403).json({ status: 'error', message: 'You have not applied for this task' });
      }
      participantTaskerId = req.user._id;
      resolvedBidId = bidder._id;
    }

    // Upsert conversation by unique key
    let conversation = await Conversation.findOne({ task: taskId, user: userId, tasker: participantTaskerId });
    if (!conversation) {
      conversation = await Conversation.create({
        task: taskId,
        bid: resolvedBidId,
        user: userId,
        tasker: participantTaskerId,
      });
    } else if (!conversation.bid && resolvedBidId) {
      conversation.bid = resolvedBidId; // fill if missing
      await conversation.save();
    }

    const populated = await Conversation.findById(conversation._id)
      .populate('task', 'title budget status')
      .populate('user', 'fullName profilePicture')
      .populate('tasker', 'firstName lastName profilePicture');

    return res.status(200).json({ status: 'success', conversation: populated });
  } catch (error) {
    Sentry.captureException(error);
    console.error('createOrGetConversation error:', error);
    return res.status(500).json({ status: 'error', message: 'Error creating conversation', error: error.message });
  }
};

export const listConversations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = req.userType === 'user' ? { user: req.user._id } : { tasker: req.user._id };

    const total = await Conversation.countDocuments(filter);
    const conversations = await Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('task', 'title budget status')
      .populate('user', 'fullName profilePicture')
      .populate('tasker', 'firstName lastName profilePicture');

    return res.status(200).json({
      status: 'success',
      conversations,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('listConversations error:', error);
    return res.status(500).json({ status: 'error', message: 'Error fetching conversations', error: error.message });
  }
};

export const getConversation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ status: 'error', message: 'Invalid conversation id' });

    const conversation = await Conversation.findById(id)
      .populate('task', 'title budget status')
      .populate('user', 'fullName profilePicture')
      .populate('tasker', 'firstName lastName profilePicture');
    if (!conversation) return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    if (!ensureParticipant(conversation, req)) return res.status(403).json({ status: 'error', message: 'Forbidden' });

    return res.status(200).json({ status: 'success', conversation });
  } catch (error) {
    Sentry.captureException(error);
    console.error('getConversation error:', error);
    return res.status(500).json({ status: 'error', message: 'Error', error: error.message });
  }
};

export const listMessages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ status: 'error', message: 'Invalid conversation id' });

    const conversation = await Conversation.findById(id);
    if (!conversation) return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    if (!ensureParticipant(conversation, req)) return res.status(403).json({ status: 'error', message: 'Forbidden' });

    const limit = parseInt(req.query.limit) || 20;
    const before = req.query.before ? new Date(req.query.before) : null;
    const query = { conversation: id };
    if (before) query.createdAt = { $lt: before };

    const messages = await Message.find(query)
      .sort({ createdAt: 1 })
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return res.status(200).json({ status: 'success', messages, hasMore });
  } catch (error) {
    Sentry.captureException(error);
    console.error('listMessages error:', error);
    return res.status(500).json({ status: 'error', message: 'Error fetching messages', error: error.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ status: 'error', message: 'Invalid conversation id' });

    const conversation = await Conversation.findById(id);
    if (!conversation) return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    if (!ensureParticipant(conversation, req)) return res.status(403).json({ status: 'error', message: 'Forbidden' });

    const { text } = req.body || {};
    const hasFiles = req.files && req.files.length > 0;
    if (!text && !hasFiles) {
      return res.status(400).json({ status: 'error', message: 'Message text or attachments required' });
    }

    // Upload attachment files to Cloudinary
    let uploadedAttachments = [];
    if (hasFiles) {
      try {
        const results = await uploadMultipleToCloudinary(req.files, 'taskhub/chat', 'auto');
        uploadedAttachments = results.map((result, i) => ({
          url: result.url,
          publicId: result.publicId,
          type: req.files[i].mimetype,
          name: req.files[i].originalname,
          size: req.files[i].size,
        }));
      } catch (uploadError) {
        console.error('Chat attachment upload error:', uploadError);
        return res.status(500).json({ status: 'error', message: 'Failed to upload attachments' });
      }
    }

    const senderType = req.userType === 'user' ? 'user' : 'tasker';
    const newMsg = await Message.create({
      conversation: id,
      senderType,
      senderUser: senderType === 'user' ? req.user._id : undefined,
      senderTasker: senderType === 'tasker' ? req.user._id : undefined,
      text: text || null,
      attachments: uploadedAttachments,
    });

    // Update conversation
    conversation.lastMessage = text ? String(text).slice(0, 200) : (uploadedAttachments.length ? 'Attachment' : '');
    conversation.lastMessageAt = new Date();
    if (senderType === 'user') conversation.unread.tasker += 1; else conversation.unread.user += 1;
    await conversation.save();

    // Push notify recipient (fire-and-forget)
    try {
      const recipientType = senderType === 'user' ? 'tasker' : 'user';
      const recipientId = recipientType === 'user' ? conversation.user : conversation.tasker;
      const preview = conversation.lastMessage || 'New message';
      notifyOnNewChatMessage(recipientType, recipientId, conversation._id, preview).catch(() => {});
    } catch {}

    return res.status(201).json({ status: 'success', message: newMsg });
  } catch (error) {
    Sentry.captureException(error);
    console.error('sendMessage error:', error);
    return res.status(500).json({ status: 'error', message: 'Error sending message', error: error.message });
  }
};

export const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ status: 'error', message: 'Invalid conversation id' });

    const conversation = await Conversation.findById(id);
    if (!conversation) return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    if (!ensureParticipant(conversation, req)) return res.status(403).json({ status: 'error', message: 'Forbidden' });

    const who = req.userType; // 'user' | 'tasker'
    // Reset unread counter for current side
    if (who === 'user') conversation.unread.user = 0; else conversation.unread.tasker = 0;
    await conversation.save();

    // Mark messages as read (best-effort)
    await Message.updateMany(
      { conversation: id, status: 'sent' },
      { $set: { status: 'read' }, $push: { readBy: { who, at: new Date() } } }
    );

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    Sentry.captureException(error);
    console.error('markRead error:', error);
    return res.status(500).json({ status: 'error', message: 'Error marking read', error: error.message });
  }
};

export default {
  createOrGetConversation,
  listConversations,
  getConversation,
  listMessages,
  sendMessage,
  markRead,
};
