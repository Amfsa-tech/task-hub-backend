import mongoose from 'mongoose';

/**
 * Stores the mapping between a Didit session_id and a userId.
 * Created when the frontend registers a session after getting it from Didit.
 * Looked up by the webhook when vendor_data is null (Didit v3 behaviour).
 */
const diditSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  userType: {
    type: String,
    enum: ['User', 'Tasker'],
    required: true,
  },
}, { timestamps: true });

export default mongoose.model('DiditSession', diditSessionSchema);
