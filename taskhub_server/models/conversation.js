import { Schema, model } from 'mongoose';

const conversationSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    bid: { type: Schema.Types.ObjectId, ref: 'Bid' },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tasker: { type: Schema.Types.ObjectId, ref: 'Tasker', required: true },
    status: {
      type: String,
      enum: ['active', 'closed', 'blocked'],
      default: 'active'
    },
    lastMessage: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
    unread: {
      user: { type: Number, default: 0 },
      tasker: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

// Ensure one conversation per task-owner <-> tasker pair
conversationSchema.index({ task: 1, user: 1, tasker: 1 }, { unique: true });
conversationSchema.index({ user: 1, updatedAt: -1 });
conversationSchema.index({ tasker: 1, updatedAt: -1 });

const Conversation = model('Conversation', conversationSchema);

export default Conversation;
