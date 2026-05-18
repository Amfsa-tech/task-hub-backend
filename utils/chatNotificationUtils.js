const toPlainObject = (value) => {
  if (!value) return value;
  return typeof value.toObject === 'function' ? value.toObject() : value;
};

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return value._id.toString();
  return value.toString();
};

const getPresence = (participant) => ({
  isOnline: Boolean(participant?.isOnline),
  lastSeenAt: participant?.lastSeenAt || null,
});

export const addParticipantPresence = (conversation, viewerType) => {
  const obj = toPlainObject(conversation);
  const participantType = viewerType === 'user' ? 'tasker' : 'user';
  const participant = obj?.[participantType];

  return {
    ...obj,
    participantPresence: {
      type: participantType,
      ...getPresence(participant),
    },
  };
};

export const buildMessageNotificationSummary = (conversations, viewerType) => {
  const notifications = conversations
    .map((conversation) => toPlainObject(conversation))
    .map((conversation) => {
      const unreadCount = Number(conversation?.unread?.[viewerType] || 0);
      return {
        conversationId: toIdString(conversation?._id),
        unreadCount,
        lastMessage: conversation?.lastMessage || null,
        lastMessageAt: conversation?.lastMessageAt || null,
        conversation: addParticipantPresence(conversation, viewerType),
      };
    })
    .filter((notification) => notification.unreadCount > 0);

  return {
    unreadCount: notifications.reduce((total, notification) => total + notification.unreadCount, 0),
    notifications,
  };
};

export const createChatNotificationPayload = (conversationId, preview) => ({
  title: 'New message',
  body: preview || 'You have a new chat message',
  data: {
    type: 'chat',
    conversationId: conversationId?.toString(),
    action: 'open_conversation',
  },
  persistRegularNotification: false,
});
