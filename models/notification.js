import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  // Made optional so it accepts either a User OR a Tasker
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tasker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tasker'
  },
  title: String,
  message: String,
  type: String,
  read: {
    type: Boolean,
    default: false
  },
  sentThrough: [{
        type: String,
        enum: ['Email', 'In-App'] // Matches the frontend checkboxes
    }],
  metadata: {
    blockchainTxId: String,
    externalLink: String
  }
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);