import { Schema, model } from 'mongoose';

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    type: { type: String },
    name: { type: String },
    size: { type: Number }
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderType: { type: String, enum: ['user', 'tasker', 'system'], required: true },
    senderUser: { type: Schema.Types.ObjectId, ref: 'User' },
    senderTasker: { type: Schema.Types.ObjectId, ref: 'Tasker' },
    text: { type: String },
    attachments: [attachmentSchema],
    status: { type: String, enum: ['sent', 'read'], default: 'sent' },
    readBy: [
      {
        who: { type: String, enum: ['user', 'tasker'] },
        at: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

const Message = model('Message', messageSchema);

export default Message;
