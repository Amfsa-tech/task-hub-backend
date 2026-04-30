# Web Push Notifications — Frontend Integration Guide

> Audience: Frontend developers and AI agents integrating browser push notifications into the client application.
> Base URL: `{{API_BASE_URL}}` (e.g., `https://api.ngtaskhub.com`)

---

## 1. Overview

TaskHub delivers notifications through three channels simultaneously: **OneSignal push** (for mobile), **Web Push** (for browsers, using VAPID), and **In-App Notifications** (stored in the database and shown in the bell icon). This guide covers how to integrate **Web Push** and **In-App Notifications** on the frontend.

Web Push allows the browser to receive push notifications even when the user doesn't have the app tab open. It works through the Push API and Service Workers — no native app or app store needed. The frontend registers a service worker, subscribes to push using a VAPID public key, and sends the subscription to the backend. The backend then sends push messages to that subscription whenever a notification event fires.

In-App Notifications are stored server-side and fetched via a simple API. They power the bell icon badge count and the notification dropdown list.

## 2. Prerequisites

- A valid **User or Tasker JWT token** (both account types support push)
- The app must be served over **HTTPS** (required by the Push API; `localhost` works for development)
- A **service worker** file (`sw.js`) registered at the root of the frontend project
- Browser must support the **Push API** and **Service Workers** (all modern browsers do)
- VAPID public key from the backend (fetched via API)

## 3. Architecture in One Paragraph

The frontend fetches the VAPID public key from the backend, registers a service worker, and creates a push subscription using the Push API. The subscription object (containing an endpoint URL and encryption keys) is sent to the backend and stored on the user's or tasker's document. When a notification event occurs (new bid, task completed, wallet funded, etc.), the backend sends a web push message to every stored subscription for that account. The service worker receives the push event and displays a browser notification. Separately, the frontend polls the in-app notifications API to show a bell icon badge and notification list.

## 4. Full Flow Diagram

```
[App Loads / User Logs In]
        |
        v
Check: Is service worker registered?
        |
   +----+----+
   |         |
  Yes        No
   |         |
   |      Register sw.js
   |         |
   +----+----+
        |
        v
GET /api/push/vapid-public-key
        |
        v
sw.pushManager.subscribe({ applicationServerKey: publicKey })
        |
        v
POST /api/push/subscribe { subscription }
        |
   +----+----+
   |         |
 200 OK    400 Error
   |         |
   v      Log error,
Subscription     retry later
registered
   |
   v
[User uses app normally]
        |
        v
[Backend fires notification event]
        |
        v
Browser receives push event in sw.js
        |
        v
sw.js shows browser notification
        |
        v
[User clicks notification]
        |
        v
Client opens relevant screen
(based on data.type in the push payload)


--- In-App Notification Flow (parallel) ---

[App loads / screen mounts]
        |
        v
GET /api/notifications
        |
        v
Display unread count on bell icon
Show notification list in dropdown
        |
        v
[User clicks a notification]
        |
        v
PATCH /api/notifications/:id/read
        |
        v
Navigate to relevant screen
```

## 5. Endpoints

### 5.1 Get VAPID Public Key

**`GET /api/push/vapid-public-key`**

Auth: `None` (public endpoint)

This is the first call the frontend makes to get the public key needed for push subscription. The key is a Base64-encoded string that identifies the backend's push server.

#### Request

No parameters required.

#### Response

**Success (200):**
```json
{
  "status": "success",
  "publicKey": "BH9xQ10GhGwnAlcZM8iAWDib-l0OyPEsmrsP1SqMnTkiX1wegi3976pQEX3Qpa-lY4IOwjXy7klDjBHbHO3H8QE"
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 503 | VAPID not configured on server | `{ "status": "error", "message": "Web push not configured" }` |

#### Frontend Implementation

**JavaScript:**
```js
async function getVapidPublicKey() {
  const response = await fetch(`${BASE_URL}/api/push/vapid-public-key`);
  const data = await response.json();

  if (data.status === 'success') {
    return data.publicKey;
  }

  console.warn('Web push not available:', data.message);
  return null;
}
```

---

### 5.2 Subscribe to Web Push

**`POST /api/push/subscribe`**

Auth: `Bearer <user_or_tasker_token>`

After creating a push subscription via the Push API, the frontend sends the subscription object to the backend for storage. The backend stores up to 5 subscriptions per account (one per browser/device). If the same endpoint is sent again, the keys are updated instead of creating a duplicate.

#### Request

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subscription` | object | Yes | The PushSubscription object from the Push API |
| `subscription.endpoint` | string | Yes | The push service endpoint URL (unique per browser) |
| `subscription.keys` | object | Yes | Encryption keys for the push subscription |
| `subscription.keys.p256dh` | string | Yes | The P-256 ECDH public key (Base64-encoded) |
| `subscription.keys.auth` | string | Yes | The authentication secret (Base64-encoded) |

**Request Body Example:**
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/eqZ3vK8xT2S:APA91bH4kQ...",
    "keys": {
      "p256dh": "BLc4fR0vQ3MaXzR5eF7kP2nS8vT1wY6zA9bC0dE1fG2hI3jK4lM5nO6p",
      "auth": "aB1cD2eF3gH4iJ5k"
    }
  }
}
```

#### Response

**Success (200):**
```json
{
  "status": "success",
  "message": "Push subscription registered"
}
```

**Subscription Updated (200):**
```json
{
  "status": "success",
  "message": "Push subscription updated"
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Invalid subscription object | `{ "status": "error", "message": "Invalid subscription object. Required: { endpoint, keys: { p256dh, auth } }" }` |
| 401 | Not authenticated | `{ "status": "error", "message": "Not authorized" }` |
| 404 | Account not found | `{ "status": "error", "message": "Account not found" }` |
| 500 | Server error | `{ "status": "error", "message": "Failed to register push subscription" }` |

#### Frontend Implementation

**JavaScript:**
```js
async function subscribeToWebPush() {
  // 1. Check browser support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported in this browser');
    return;
  }

  // 2. Request notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('Notification permission denied');
    return;
  }

  // 3. Get VAPID public key
  const publicKey = await getVapidPublicKey();
  if (!publicKey) return;

  // 4. Register service worker (if not already registered)
  const registration = await navigator.serviceWorker.register('/sw.js');

  // 5. Create push subscription
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });

  // 6. Send subscription to backend
  const response = await fetch(`${BASE_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subscription: subscription.toJSON()
    })
  });

  const data = await response.json();
  if (data.status === 'success') {
    console.log('Web push subscribed:', data.message);
  }
}

// Helper: Convert VAPID key from Base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

**React Native:**
> Web Push is a browser API and does not apply to React Native. For mobile push, continue using OneSignal. This endpoint is only for web/PWA clients.

---

### 5.3 Unsubscribe from Web Push

**`POST /api/push/unsubscribe`**

Auth: `Bearer <user_or_tasker_token>`

Call this when the user logs out, revokes notification permission, or the subscription is no longer valid. The backend removes the subscription from the account's stored list.

#### Request

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | Yes | The endpoint URL of the subscription to remove |

**Request Body Example:**
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/eqZ3vK8xT2S:APA91bH4kQ..."
}
```

#### Response

**Success (200):**
```json
{
  "status": "success",
  "message": "Push subscription removed",
  "removed": true
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing endpoint | `{ "status": "error", "message": "Endpoint is required" }` |
| 401 | Not authenticated | `{ "status": "error", "message": "Not authorized" }` |
| 500 | Server error | `{ "status": "error", "message": "Failed to remove push subscription" }` |

#### Frontend Implementation

**JavaScript:**
```js
async function unsubscribeFromWebPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    // Remove from backend first
    await fetch(`${BASE_URL}/api/push/unsubscribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });

    // Then unsubscribe from the browser
    await subscription.unsubscribe();
    console.log('Unsubscribed from web push');
  }
}
```

---

### 5.4 Get In-App Notifications

**`GET /api/notifications`**

Auth: `Bearer <user_or_tasker_token>`

Fetches the 20 most recent in-app notifications for the logged-in account. Use this to populate the bell icon badge count and the notification dropdown list.

#### Request

No parameters required.

#### Response

**Success (200):**
```json
{
  "status": "success",
  "data": {
    "unreadCount": 3,
    "notifications": [
      {
        "_id": "6651a2f3e4b0c7d8e9f0a1b2",
        "user": "6651a2f3e4b0c7d8e9f0a1b3",
        "tasker": null,
        "title": "New Bid Received",
        "message": "John Doe placed a bid of ₦5000 on your task",
        "type": "bid",
        "read": false,
        "metadata": {
          "bidId": "6651a2f3e4b0c7d8e9f0a1b4",
          "taskId": "6651a2f3e4b0c7d8e9f0a1b5"
        },
        "createdAt": "2025-05-20T14:30:00.000Z",
        "updatedAt": "2025-05-20T14:30:00.000Z"
      },
      {
        "_id": "6651a2f3e4b0c7d8e9f0a1b6",
        "user": null,
        "tasker": "6651a2f3e4b0c7d8e9f0a1b7",
        "title": "Payout Received! 💰",
        "message": "₦4250 has been credited to your wallet for completing \"Fix my sink\"",
        "type": "payout",
        "read": false,
        "metadata": {
          "taskId": "6651a2f3e4b0c7d8e9f0a1b5",
          "amount": 4250
        },
        "createdAt": "2025-05-20T15:00:00.000Z",
        "updatedAt": "2025-05-20T15:00:00.000Z"
      }
    ]
  }
}
```

**Notification Object Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Notification ID (used for marking as read) |
| `user` | string \| null | User ID (present if notification is for a user) |
| `tasker` | string \| null | Tasker ID (present if notification is for a tasker) |
| `title` | string | Notification title (e.g., "New Bid Received") |
| `message` | string | Notification body text |
| `type` | string | Category: `bid`, `task`, `wallet`, `escrow`, `payout`, `withdrawal`, `chat`, `welcome`, `kyc` |
| `read` | boolean | Whether the user has seen this notification |
| `metadata` | object | Extra data for deep linking (varies by type) |
| `createdAt` | string (ISO 8601) | When the notification was created |

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 401 | Not authenticated | `{ "status": "error", "message": "Not authorized" }` |
| 500 | Server error | `{ "status": "error", "message": "Failed to fetch notifications" }` |

#### Frontend Implementation

**JavaScript:**
```js
async function fetchNotifications() {
  const response = await fetch(`${BASE_URL}/api/notifications`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();

  if (data.status === 'success') {
    // Update bell badge
    updateBadgeCount(data.data.unreadCount);
    // Update notification list
    setNotifications(data.data.notifications);
  }
}
```

---

### 5.5 Mark Notification as Read

**`PATCH /api/notifications/:id/read`**

Auth: `Bearer <user_or_tasker_token>`

Call this when the user clicks or views a notification. It marks the notification as read and decrements the unread badge count.

#### Request

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The notification `_id` to mark as read |

#### Response

**Success (200):**
```json
{
  "status": "success",
  "message": "Marked as read"
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 403 | Notification doesn't belong to this user | `{ "status": "error", "message": "Unauthorized" }` |
| 404 | Notification not found | `{ "status": "error", "message": "Notification not found" }` |
| 500 | Server error | `{ "status": "error", "message": "Failed to update notification" }` |

#### Frontend Implementation

**JavaScript:**
```js
async function markNotificationRead(notificationId) {
  await fetch(`${BASE_URL}/api/notifications/${notificationId}/read`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}
```

---

## 6. Service Worker Setup

The service worker (`sw.js`) must be placed at the **root** of the frontend project so it can handle push events for the entire app scope.

### `sw.js` — Complete Example

```js
// sw.js — Service Worker for Web Push Notifications

// Handle push events from the server
self.addEventListener('push', (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'TaskHub', body: 'You have a new notification' };
    }
  }

  const title = data.title || 'TaskHub';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/badge-72x72.png',
    vibrate: data.vibrate || [100, 50, 100],
    data: data.data || {},
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const clickData = event.notification.data || {};
  let url = '/';

  // Deep link based on notification type
  if (clickData.type === 'new_task' && clickData.taskId) {
    url = `/tasks/${clickData.taskId}`;
  } else if (clickData.type === 'bid' && clickData.taskId) {
    url = `/tasks/${clickData.taskId}?tab=bids`;
  } else if (clickData.type === 'bid_accepted' && clickData.taskId) {
    url = `/tasks/${clickData.taskId}`;
  } else if (clickData.type === 'task_completed' && clickData.taskId) {
    url = `/tasks/${clickData.taskId}`;
  } else if (clickData.type === 'task_started' && clickData.taskId) {
    url = `/tasks/${clickData.taskId}`;
  } else if (clickData.type === 'task_cancelled' && clickData.taskId) {
    url = `/tasks/${clickData.taskId}`;
  } else if (clickData.type === 'chat' && clickData.conversationId) {
    url = `/chat/${clickData.conversationId}`;
  } else if (clickData.type === 'wallet' || clickData.type === 'payout' || clickData.type === 'withdrawal' || clickData.type === 'escrow' || clickData.type === 'escrow_refund') {
    url = '/wallet';
  } else if (clickData.action === 'view_task' && clickData.taskId) {
    url = `/tasks/${clickData.taskId}`;
  } else if (clickData.action === 'view_wallet') {
    url = '/wallet';
  } else if (clickData.action === 'view_bid' && clickData.bidId) {
    url = `/bids/${clickData.bidId}`;
  } else if (clickData.action === 'open_conversation' && clickData.conversationId) {
    url = `/chat/${clickData.conversationId}`;
  }

  // Open or focus the app window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
```

## 7. State Management

- **Push subscription state**: Store whether the user is subscribed in global state (e.g., `isPushSubscribed: true/false`). Check on app load by calling `registration.pushManager.getSubscription()`.
- **In-app notifications**: Store `unreadCount` and `notifications` array in global state. Update after every `GET /api/notifications` call.
- **Polling**: Poll `GET /api/notifications` every 60 seconds when the app is in the foreground, or use the `visibilitychange` event to refetch when the user returns to the tab.
- **Optimistic badge update**: When the user clicks a notification, immediately decrement `unreadCount` in local state while the `PATCH` request runs in the background.

## 8. Notification Types & Deep Link Map

The backend sends a `data` payload with every push notification. Use the `type` and `action` fields to deep-link the user to the correct screen.

| `data.type` | `data.action` | Deep Link | Description |
|-------------|---------------|-----------|-------------|
| `new_task` | `view_task` | `/tasks/:taskId` | New task matching tasker's categories |
| `bid` | `view_bid` | `/tasks/:taskId?tab=bids` | New bid on user's task |
| `bid_accepted` | `view_task` | `/tasks/:taskId` | Tasker's bid was accepted |
| `bid_rejected` | `view_task` | `/tasks/:taskId` | Tasker's bid was not selected |
| `task_assigned` | `view_task` | `/tasks/:taskId` | Tasker assigned to user's task |
| `task_started` | `view_task` | `/tasks/:taskId` | Tasker started working (includes `completionCode` in data) |
| `task_completed` | `view_task` | `/tasks/:taskId` | Tasker completed the task |
| `task_cancelled` | `view_task` | `/tasks/:taskId` | Task was cancelled |
| `task_updated` | `view_task` | `/tasks/:taskId` | Task details were updated |
| `chat` | `open_conversation` | `/chat/:conversationId` | New chat message |
| `wallet` | `view_wallet` | `/wallet` | Wallet funded (Paystack or Stellar) |
| `escrow` | `view_task` | `/tasks/:taskId` | Escrow held from wallet |
| `escrow_refund` | `view_wallet` | `/wallet` | Escrow refunded to wallet |
| `payout` | `view_wallet` | `/wallet` | Payout received (escrow released) |
| `withdrawal` | `view_wallet` | `/wallet` | Withdrawal status update |
| `welcome` | `open_app` / `browse_tasks` | `/` | Welcome notification |

## 9. Error Handling Guide

| Error | HTTP Status | Frontend Action |
|-------|-------------|-----------------|
| `"Web push not configured"` | 503 | Hide push subscription UI. Show "Push notifications unavailable" message. |
| `"Invalid subscription object"` | 400 | Check the subscription object structure. Log the error and retry subscription. |
| `"Notification permission denied"` | N/A (browser) | Show a banner: "Enable notifications in browser settings to stay updated." Link to browser settings. |
| `"Push notifications not supported"` | N/A (browser) | Hide push subscription UI entirely. Only show in-app notifications. |
| `"Not authorized"` | 401 | Redirect to login. The token has expired. |
| `"Account not found"` | 404 | Force logout and redirect to login. |
| `"Endpoint is required"` | 400 | Ensure the `endpoint` field is included in the unsubscribe request. |
| Network error | N/A | Queue the subscription request and retry when online. Don't lose the subscription object. |

## 10. UI/UX Notes

- **Permission prompt timing**: Don't request notification permission on page load. Wait until the user takes an action that clearly benefits from notifications (e.g., after posting a task or completing registration). This dramatically increases the acceptance rate.
- **Permission state**: Check `Notification.permission` before showing any prompt UI. If it's `"default"`, show a soft prompt. If it's `"denied"`, show a settings link. If it's `"granted"`, hide the prompt.
- **Subscription on login**: After successful login, automatically subscribe to web push if permission is already granted. This ensures the new session's token is associated with the push subscription.
- **Unsubscription on logout**: Call `POST /api/push/unsubscribe` before clearing the token on logout. This prevents the backend from sending push to a logged-out session.
- **Multiple devices**: The backend stores up to 5 subscriptions per account. The frontend doesn't need to manage this — each browser creates its own subscription automatically.
- **Badge count**: Display `unreadCount` as a red badge on the bell icon. Update it when notifications are fetched or marked as read.
- **Notification list**: Show the 20 most recent notifications in a dropdown. Display `title`, `message`, and relative time (`createdAt`). Unread notifications should have a visual indicator (e.g., blue dot or bold text).
- **Push while app is open**: When the app is in the foreground, the service worker still shows the browser notification. Consider also updating the in-app notification list in real-time by listening for the `message` event from the service worker.

## 11. Common Integration Patterns

### Pattern: On Login — Subscribe to Push
1. After successful login, store the JWT token
2. Check `Notification.permission` — if `"granted"`, call `subscribeToWebPush()`
3. If `"default"`, show a soft prompt: "Stay updated? Enable notifications."
4. If `"denied"`, skip silently
5. Fetch in-app notifications: `GET /api/notifications`

### Pattern: On Logout — Unsubscribe from Push
1. Call `unsubscribeFromWebPush()` with the current token
2. Clear the stored JWT token
3. Reset notification state (clear `unreadCount`, `notifications`)

### Pattern: Bell Icon & Notification Dropdown
1. On app mount, call `GET /api/notifications`
2. Display `unreadCount` as a red badge on the bell icon
3. When the user clicks the bell, show a dropdown with the `notifications` array
4. When the user clicks a notification, call `PATCH /api/notifications/:id/read`
5. Navigate to the deep link based on the notification's `type` and `metadata`
6. Poll `GET /api/notifications` every 60 seconds to keep the badge updated

### Pattern: Handling Push While App Is Open
1. In the service worker, post a message to all clients when a push arrives
2. In the main app, listen for service worker messages
3. Update the in-app notification list and badge count without a full refetch

```js
// In main app (not in sw.js)
navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PUSH_RECEIVED') {
    // Refetch notifications to update the badge
    fetchNotifications();
  }
});
```

```js
// In sw.js — add to the push event handler
self.addEventListener('push', (event) => {
  // ... existing notification display code ...

  // Also notify all open windows
  clients.matchAll({ type: 'window' }).then((windowClients) => {
    for (const client of windowClients) {
      client.postMessage({ type: 'PUSH_RECEIVED', data: data.data });
    }
  });
});
```

## 12. Complete Notification Events Reference

The backend sends notifications for the following events. Each fires on all three channels (OneSignal push, Web Push, In-App).

### For Users

| Event | Title | Body Template | `data.type` |
|-------|-------|---------------|-------------|
| Wallet funded (Paystack) | Wallet Funded 💰 | ₦{amount} has been added to your wallet via card payment. | `wallet` |
| Wallet funded (Stellar) | Wallet Funded 💰 | ₦{amount} has been added to your wallet via crypto deposit. | `wallet` |
| New bid on task | New Bid Received | {taskerName} placed a bid of ₦{amount} on your task | `bid` |
| Bid withdrawn | Bid Withdrawn | {taskerName} withdrew their bid on your task "{taskTitle}" | `bid` |
| Tasker assigned | Tasker Assigned ✅ | {taskerName} has been assigned to your task "{taskTitle}" | `task_assigned` |
| Escrow held | Payment Held in Escrow 🔒 | ₦{amount} has been held in escrow for task "{taskTitle}" | `escrow` |
| Escrow refunded | Escrow Refunded 💸 | ₦{amount} has been refunded to your wallet for the cancelled task "{taskTitle}" | `escrow_refund` |
| Task started | Task Started 🚀 | {taskerName} has started working on "{taskTitle}". Your completion code is: {code} | `task_started` |
| Task completed | Task Completed | {taskerName} has completed your task "{taskTitle}" | `task_completed` |
| Task cancelled | Task Cancelled | The task "{taskTitle}" has been cancelled by the user | `task_cancelled` |
| Task updated | Task Updated | The task "{taskTitle}" has been updated. Changes: {fields} | `task_updated` |
| New chat message | New message | {preview text} | `chat` |
| Welcome | Welcome to TaskHub, {name}! | Start posting tasks and get things done quickly and efficiently. | `welcome` |

### For Taskers

| Event | Title | Body Template | `data.type` |
|-------|-------|---------------|-------------|
| Wallet funded (Stellar) | Wallet Funded 💰 | ₦{amount} has been added to your wallet via crypto deposit. | `wallet` |
| New matching task | New {category} Task Available | "{taskTitle}" - ₦{budget} | `new_task` |
| Bid accepted | Bid Accepted! | Congratulations! Your bid of ₦{amount} has been accepted for "{taskTitle}" | `bid_accepted` |
| Bid rejected | Bid Update | Your bid of ₦{amount} for "{taskTitle}" was not selected this time | `bid_rejected` |
| Payout received | Payout Received! 💰 | ₦{amount} has been credited to your wallet for completing "{taskTitle}" | `payout` |
| Task cancelled (assigned) | Task Cancelled | The task "{taskTitle}" has been cancelled by the user | `task_cancelled` |
| Task cancelled (open, bidder) | Task Cancelled | The task "{taskTitle}" that you applied for has been cancelled | `task_cancelled` |
| Task updated | Task Updated | The task "{taskTitle}" has been updated. Changes: {fields} | `task_updated` |
| Withdrawal submitted | Withdrawal Request Submitted 📋 | Your withdrawal of ₦{amount} has been submitted and is awaiting approval. | `withdrawal` |
| Withdrawal approved (bank) | Withdrawal Approved 🏦 | Your bank withdrawal of ₦{amount} is being processed. | `withdrawal` |
| Withdrawal completed (bank) | Withdrawal Completed ✅ | ₦{amount} has been sent to your {bankName} account. | `withdrawal` |
| Withdrawal completed (crypto) | Payout Successful! 🚀 | Your withdrawal of ₦{amount} ({xlm} XLM) has been sent to your wallet. | `payout` |
| Withdrawal rejected | Withdrawal Update ⚠️ | Your withdrawal of ₦{amount} was not approved. Reason: {reason}. Funds returned to wallet. | `withdrawal` |
| New chat message | New message | {preview text} | `chat` |
| Welcome | Welcome to TaskHub, {name}! | Start browsing available tasks and earn money by helping others. | `welcome` |

## 13. Testing Checklist

- [ ] `GET /api/push/vapid-public-key` returns a valid Base64 public key
- [ ] Service worker (`sw.js`) registers successfully on page load
- [ ] Notification permission prompt appears when requested
- [ ] After granting permission, `POST /api/push/subscribe` returns 200
- [ ] Browser receives a push notification when the backend fires a notification event
- [ ] Clicking a push notification navigates to the correct screen
- [ ] `POST /api/push/unsubscribe` removes the subscription on logout
- [ ] `GET /api/notifications` returns the notification list with `unreadCount`
- [ ] Bell icon badge updates with the correct unread count
- [ ] `PATCH /api/notifications/:id/read` marks a notification as read
- [ ] Badge count decrements after marking a notification as read
- [ ] Unauthenticated requests to `/api/push/subscribe` return 401
- [ ] Unauthenticated requests to `/api/notifications` return 401
- [ ] Push notifications still work when the app tab is closed
- [ ] Multiple browser tabs don't create duplicate subscriptions
- [ ] Expired subscriptions are cleaned up automatically (no client action needed)

## 14. Changelog

| Date | Change | Breaking? |
|------|--------|-----------|
| 2025-04-28 | Initial guide — Web Push + In-App Notifications | No |