import Notification from '../models/notification.js';

export const saveNotification = async ({ userId, title, message, type }) => {
  return Notification.create({
    user: userId,
    title,
    message,
    type
  });
};
