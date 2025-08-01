# Push Notification System Documentation

This document outlines the push notification system for the TaskHub application using OneSignal integration.

## Overview

The notification system allows sending push notifications to users and taskers through their registered devices. Users must provide their OneSignal notification ID to receive notifications.

## Base URL
```
/api/auth
```

## Environment Variables

```env
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_REST_KEY=your-onesignal-rest-api-key
```

## Database Schema Updates

### User Model
```javascript
{
  // ... existing fields
  notificationId: { 
    type: String, 
    default: null,
    index: true // Index for efficient querying when sending notifications
  }
}
```

### Tasker Model
```javascript
{
  // ... existing fields
  notificationId: { 
    type: String, 
    default: null,
    index: true // Index for efficient querying when sending notifications
  }
}
```

## API Endpoints

### 1. Update User Notification ID

**Endpoint:** `PUT /api/auth/user/notification-id`

**Description:** Update the notification ID for a user to enable push notifications.

**Authentication:** Required (User only)

**Headers:**
```
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "notificationId": "your-onesignal-subscription-id"
}
```

**Success Response (200 OK):**
```json
{
  "status": "success",
  "message": "Notification ID updated successfully",
  "data": {
    "userId": "60f1b2a3c45d6e7f8a9b0c1d",
    "fullName": "John Doe",
    "notificationId": "your-onesignal-subscription-id"
  }
}
```

### 2. Update Tasker Notification ID

**Endpoint:** `PUT /api/auth/tasker/notification-id`

**Description:** Update the notification ID for a tasker to enable push notifications.

**Authentication:** Required (Tasker only)

**Headers:**
```
Authorization: Bearer <tasker_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "notificationId": "your-onesignal-subscription-id"
}
```

**Success Response (200 OK):**
```json
{
  "status": "success",
  "message": "Notification ID updated successfully",
  "data": {
    "taskerId": "60f1b2a3c45d6e7f8a9b0c1d",
    "firstName": "Jane",
    "lastName": "Smith",
    "notificationId": "your-onesignal-subscription-id"
  }
}
```

### 3. Remove User Notification ID

**Endpoint:** `DELETE /api/auth/user/notification-id`

**Description:** Remove the notification ID for a user (when logging out or uninstalling app).

**Authentication:** Required (User only)

**Success Response (200 OK):**
```json
{
  "status": "success",
  "message": "Notification ID removed successfully",
  "data": {
    "userId": "60f1b2a3c45d6e7f8a9b0c1d",
    "fullName": "John Doe",
    "notificationId": null
  }
}
```

### 4. Remove Tasker Notification ID

**Endpoint:** `DELETE /api/auth/tasker/notification-id`

**Description:** Remove the notification ID for a tasker (when logging out or uninstalling app).

**Authentication:** Required (Tasker only)

**Success Response (200 OK):**
```json
{
  "status": "success",
  "message": "Notification ID removed successfully",
  "data": {
    "taskerId": "60f1b2a3c45d6e7f8a9b0c1d",
    "firstName": "Jane",
    "lastName": "Smith",
    "notificationId": null
  }
}
```

## Notification Types

### 1. New Task Notifications
Sent to taskers when a new task matches their categories.

**Payload:**
```json
{
  "type": "new_task",
  "taskId": "task_id",
  "categories": "Cleaning, Home Maintenance",
  "action": "view_task"
}
```

### 2. Bid Notifications
Sent to users when they receive new bids on their tasks.

**Payload:**
```json
{
  "type": "bid",
  "bidId": "bid_id",
  "taskId": "task_id",
  "action": "view_bid"
}
```

### 3. Bid Status Notifications
Sent to taskers when their bids are accepted or rejected.

**Payload:**
```json
{
  "type": "task",
  "taskId": "task_id",
  "action": "view_task"
}
```

### 4. Task Completion Notifications
Sent to users when their tasks are completed.

**Payload:**
```json
{
  "type": "task",
  "taskId": "task_id",
  "action": "view_task"
}
```

### 5. Welcome Notifications
Sent to new users and taskers after registration.

**Payload:**
```json
{
  "type": "welcome",
  "action": "open_app" // or "browse_tasks" for taskers
}
```

## Notification Utility Functions

### Core Functions

1. **`notifyMatchingTaskers(task)`** - Notify taskers about new tasks
2. **`notifyUserAboutNewBid(userId, task, bid, tasker)`** - Notify user about new bids
3. **`notifyTaskerAboutBidAcceptance(taskerId, task, bid)`** - Notify tasker about bid acceptance
4. **`notifyTaskerAboutBidRejection(taskerId, task, bid)`** - Notify tasker about bid rejection
5. **`notifyUserAboutTaskCompletion(userId, task, tasker)`** - Notify user about task completion
6. **`notifyTaskerAboutTaskCancellation(taskerId, task)`** - Notify tasker about task cancellation
7. **`sendWelcomeNotificationToUser(userId)`** - Send welcome notification to new user
8. **`sendWelcomeNotificationToTasker(taskerId)`** - Send welcome notification to new tasker

### OneSignal Service Functions

1. **`sendPushToUser(notificationId, heading, message, data)`** - Send notification to single user
2. **`sendPushToMultipleUsers(notificationIds, heading, message, data)`** - Send notification to multiple users
3. **`sendTaskNotification(notificationId, taskTitle, message, taskId)`** - Send task-related notification
4. **`sendBidNotification(notificationId, title, message, bidId, taskId)`** - Send bid-related notification

## Integration Examples

### Frontend (Flutter/React Native)

```javascript
// Update notification ID after OneSignal initialization
const updateNotificationId = async (userType, notificationId) => {
  try {
    const endpoint = userType === 'user' 
      ? '/api/auth/user/notification-id'
      : '/api/auth/tasker/notification-id';
      
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ notificationId })
    });
    
    const result = await response.json();
    console.log('Notification ID updated:', result);
  } catch (error) {
    console.error('Error updating notification ID:', error);
  }
};

// Remove notification ID on logout
const removeNotificationId = async (userType) => {
  try {
    const endpoint = userType === 'user' 
      ? '/api/auth/user/notification-id'
      : '/api/auth/tasker/notification-id';
      
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });
    
    const result = await response.json();
    console.log('Notification ID removed:', result);
  } catch (error) {
    console.error('Error removing notification ID:', error);
  }
};
```

### Backend Integration

```javascript
// Example: Notify taskers when creating a new task
import { notifyMatchingTaskers } from '../utils/notificationUtils.js';

export const createTask = async (req, res) => {
  try {
    // ... create task logic
    const newTask = await task.save();
    
    // Notify matching taskers
    await notifyMatchingTaskers(newTask);
    
    res.status(201).json({
      status: 'success',
      data: { task: newTask }
    });
  } catch (error) {
    // ... error handling
  }
};
```

## Best Practices

### 1. Notification ID Management
- Update notification ID immediately after OneSignal initialization
- Remove notification ID on logout/app uninstall
- Handle cases where users might have multiple devices

### 2. Error Handling
- Always check if user has notification ID before sending
- Log notification failures for debugging
- Provide fallback mechanisms (email, in-app notifications)

### 3. Performance
- Use batch notifications for multiple recipients
- Index notification ID fields for efficient querying
- Implement rate limiting to prevent spam

### 4. Privacy
- Never expose notification IDs in public APIs
- Allow users to opt-out of notifications
- Respect user notification preferences

### 5. Testing
- Test notifications in both development and production
- Verify notification delivery and payload handling
- Test edge cases (invalid IDs, network failures)

## Troubleshooting

### Common Issues

1. **Notifications not received**
   - Check if notification ID is properly stored
   - Verify OneSignal configuration
   - Check device notification permissions

2. **Invalid notification ID errors**
   - Validate ID format before storing
   - Handle OneSignal API errors gracefully
   - Update IDs when they change

3. **Performance issues**
   - Use batch notifications for multiple users
   - Implement proper indexing on notification fields
   - Monitor API rate limits

### Debug Endpoints

For development, you can add debug endpoints to test notifications:

```javascript
// Debug: Test notification to specific user
router.post('/debug/test-notification', protectAny, async (req, res) => {
  const { notificationId, title, message } = req.body;
  try {
    await sendPushToUser(notificationId, title, message);
    res.json({ status: 'success', message: 'Test notification sent' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
```

## Security Considerations

1. **Authentication**: All notification endpoints require proper authentication
2. **Validation**: Validate all input data before processing
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Logging**: Log notification activities for audit purposes
5. **Error Handling**: Don't expose sensitive information in error messages
