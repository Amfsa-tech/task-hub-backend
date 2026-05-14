import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addParticipantPresence,
  buildMessageNotificationSummary,
  createChatNotificationPayload,
} from '../utils/chatNotificationUtils.js';

describe('chat message notifications', () => {
  it('summarizes unread message notifications for the current chat participant only', () => {
    const conversations = [
      {
        _id: 'conv-user-unread',
        lastMessage: 'Hello',
        lastMessageAt: new Date('2026-05-14T10:00:00.000Z'),
        unread: { user: 2, tasker: 0 },
      },
      {
        _id: 'conv-tasker-unread',
        lastMessage: 'I can start now',
        lastMessageAt: new Date('2026-05-14T10:05:00.000Z'),
        unread: { user: 0, tasker: 5 },
      },
    ];

    const summary = buildMessageNotificationSummary(conversations, 'user');

    assert.equal(summary.unreadCount, 2);
    assert.equal(summary.notifications.length, 1);
    assert.equal(summary.notifications[0].conversationId, 'conv-user-unread');
    assert.equal(summary.notifications[0].unreadCount, 2);
  });

  it('adds the other chat participant online status and last seen', () => {
    const lastSeenAt = new Date('2026-05-14T11:00:00.000Z');
    const conversation = {
      toObject() {
        return {
          _id: 'conv-presence',
          user: { _id: 'user-1', fullName: 'A User', isOnline: true, lastSeenAt },
          tasker: { _id: 'tasker-1', firstName: 'A', lastName: 'Tasker', isOnline: false, lastSeenAt: null },
        };
      },
    };

    const userView = addParticipantPresence(conversation, 'user');
    const taskerView = addParticipantPresence(conversation, 'tasker');

    assert.deepEqual(userView.participantPresence, {
      type: 'tasker',
      isOnline: false,
      lastSeenAt: null,
    });
    assert.deepEqual(taskerView.participantPresence, {
      type: 'user',
      isOnline: true,
      lastSeenAt,
    });
  });

  it('builds chat push payloads without regular notification persistence', () => {
    const payload = createChatNotificationPayload('conv-1', 'New text');

    assert.equal(payload.title, 'New message');
    assert.equal(payload.body, 'New text');
    assert.deepEqual(payload.data, {
      type: 'chat',
      conversationId: 'conv-1',
      action: 'open_conversation',
    });
    assert.equal(payload.persistRegularNotification, false);
  });
});
