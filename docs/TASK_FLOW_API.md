# TaskHub API — Full Task Flow (Post → Complete → Withdraw)

> Base URL: `/api`
> All protected endpoints require `Authorization: Bearer <token>` header.
> `protectUser` = User JWT token. `protectTasker` = Tasker JWT token. `protectAny` = either.

---

## Flow Overview

```
USER: Fund wallet → Post task → Review bids → Accept bid (escrow locks) → Share completion code → Confirm task done
TASKER: Browse feed → Place bid → Get accepted → Start task → Get code from user → Submit code → Get paid → Withdraw
```

### Task Status Lifecycle

```
open → assigned → in-progress → completed
  ↓        ↓           ↓
cancelled cancelled  cancelled
(user)    (user)     (user)
```

### Escrow Lifecycle

```
Bid accepted → funds deducted from user wallet (escrow_hold)
Task completed → funds released to tasker wallet minus 15% fee (escrow_release + platform_fee)
Task cancelled → funds returned to user wallet (escrow_refund)
```

---

## PHASE 1 — User Funds Wallet

### 1.1 Initialize Payment

```
POST /api/wallet/fund/initialize
Auth: protectUser
```

**Request Body:**
```json
{
  "amount": 5000
}
```
> `amount` is in Naira (₦). Minimum: 100.

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Payment initialized",
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/abc123",
    "accessCode": "abc123xyz",
    "reference": "WF-userId-1234567890-a1b2c3d4"
  }
}
```

**Frontend action:** Redirect user to `authorizationUrl`. After payment, Paystack redirects back to your callback URL with `?reference=...`.

---

### 1.2 Verify Payment (after redirect)

```
GET /api/wallet/fund/verify?reference=WF-userId-1234567890-a1b2c3d4
Auth: protectUser
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Payment verified and wallet credited",
  "data": {
    "reference": "WF-userId-1234567890-a1b2c3d4",
    "amount": 5000,
    "transactionStatus": "success",
    "creditedAt": "2026-03-16T12:00:00.000Z"
  }
}
```

> The webhook also credits the wallet. This endpoint is a fallback/confirmation for the frontend.

---

### 1.3 Check User Wallet Balance

```
GET /api/wallet/user/balance
Auth: protectUser
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "walletBalance": 15000,
    "totalInEscrow": 5000,
    "availableBalance": 15000
  }
}
```

> `walletBalance` = spendable cash. `totalInEscrow` = funds locked in active tasks. The wallet balance is already reduced when escrow is held, so `availableBalance === walletBalance`.

---

### 1.4 User Transaction History

```
GET /api/wallet/user/transactions?page=1&limit=10&purpose=wallet_funding
Auth: protectUser
```

**Query Params:**
| Param | Type | Default | Options |
|-------|------|---------|---------|
| `page` | number | 1 | — |
| `limit` | number | 10 | — |
| `purpose` | string | (all) | `wallet_funding`, `escrow_hold`, `escrow_release`, `escrow_refund`, `platform_fee` |

**Success Response (200):**
```json
{
  "status": "success",
  "results": 2,
  "totalRecords": 5,
  "totalPages": 1,
  "currentPage": 1,
  "transactions": [
    {
      "_id": "...",
      "amount": 5000,
      "type": "credit",
      "description": "Wallet funding via Paystack",
      "status": "success",
      "reference": "WF-...",
      "paymentPurpose": "wallet_funding",
      "createdAt": "2026-03-16T12:00:00.000Z",
      "metadata": {}
    },
    {
      "_id": "...",
      "amount": 3000,
      "type": "debit",
      "description": "Escrow held for task: Fix my plumbing",
      "status": "success",
      "reference": "ESC-HOLD-...",
      "paymentPurpose": "escrow_hold",
      "createdAt": "2026-03-16T13:00:00.000Z",
      "metadata": { "taskId": "...", "bidId": "...", "taskerId": "..." }
    }
  ]
}
```

---

## PHASE 2 — User Posts a Task

### 2.1 Create Task

```
POST /api/tasks
Auth: protectUser
```

**Request Body:**
```json
{
  "title": "Fix my kitchen sink",
  "description": "The pipe is leaking under the sink...",
  "categories": ["categoryId1", "categoryId2"],
  "tags": ["plumbing", "urgent"],
  "images": [{ "url": "https://example.com/photo.jpg" }],
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  },
  "budget": 5000,
  "isBiddingEnabled": true,
  "deadline": "2026-03-20T00:00:00.000Z"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | Yes | — |
| `description` | Yes | — |
| `categories` | Yes | Array of category ObjectIds (at least one) |
| `tags` | No | Array of strings |
| `images` | No | Array of `{ url }` objects |
| `location.latitude` | Yes | — |
| `location.longitude` | Yes | — |
| `budget` | Yes | Positive number (₦) |
| `isBiddingEnabled` | No | Default: `false`. If `true`, taskers set their own price. If `false`, taskers apply at the fixed budget price. |
| `deadline` | No | Must be a future date |

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Task created successfully",
  "task": {
    "_id": "taskId",
    "title": "Fix my kitchen sink",
    "status": "open",
    "budget": 5000,
    "isBiddingEnabled": true,
    "escrowAmount": 0,
    "isEscrowHeld": false,
    "...": "..."
  }
}
```

---

### 2.2 Get User's Tasks

```
GET /api/tasks/user/tasks
Auth: protectUser
```

**Success Response (200):**
```json
{
  "status": "success",
  "count": 3,
  "totalPages": 1,
  "currentPage": 1,
  "tasks": [ { "...task objects..." } ]
}
```

---

## PHASE 3 — Tasker Browses & Bids

### 3.1 Tasker Feed

```
GET /api/tasks/tasker/feed
Auth: protectTasker
```

Returns open tasks matching the tasker's categories and location. Paginated.

---

### 3.2 View Task Details

```
GET /api/tasks/:id
Auth: none (public)
```

**Success Response (200):**
```json
{
  "status": "success",
  "task": {
    "_id": "taskId",
    "title": "Fix my kitchen sink",
    "description": "...",
    "budget": 5000,
    "status": "open",
    "isBiddingEnabled": true,
    "user": { "fullName": "John Doe", "profilePicture": "..." },
    "...": "..."
  }
}
```

---

### 3.3 Place a Bid

```
POST /api/bids
Auth: protectTasker
```

**Request Body:**
```json
{
  "taskId": "taskObjectId",
  "amount": 4500,
  "message": "I have 5 years of plumbing experience..."
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `taskId` | Yes | — |
| `amount` | Only if `isBiddingEnabled` is `true` | Tasker's proposed price. Ignored for fixed-price tasks. |
| `message` | No | Cover letter / pitch |

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Bid placed successfully",
  "bid": {
    "_id": "bidId",
    "task": "taskId",
    "tasker": "taskerId",
    "amount": 4500,
    "bidType": "custom",
    "status": "pending",
    "message": "I have 5 years...",
    "taskBiddingEnabled": true
  }
}
```

---

### 3.4 Update a Bid

```
PUT /api/bids/:id
Auth: protectTasker
```

**Request Body:**
```json
{
  "amount": 4000,
  "message": "Updated pitch..."
}
```

---

### 3.5 Withdraw a Bid

```
DELETE /api/bids/:id
Auth: protectTasker
```

---

### 3.6 Get Tasker's Own Bids

```
GET /api/bids/tasker/bids?status=pending&page=1&limit=10
Auth: protectTasker
```

**Query Params:**
| Param | Type | Options |
|-------|------|---------|
| `status` | string | `pending`, `accepted`, `rejected` |
| `page` | number | Default: 1 |
| `limit` | number | Default: 10 |

---

## PHASE 4 — User Reviews & Accepts a Bid

### 4.1 View All Bids on a Task

```
GET /api/bids/task/:taskId
Auth: protectUser
```

**Success Response (200):**
```json
{
  "status": "success",
  "count": 3,
  "bids": [
    {
      "_id": "bidId",
      "tasker": { "firstName": "Ade", "lastName": "Johnson", "profilePicture": "..." },
      "amount": 4500,
      "message": "...",
      "bidType": "custom",
      "status": "pending"
    }
  ]
}
```

---

### 4.2 Accept a Bid ⚡ (Escrow Lock)

```
POST /api/bids/:id/accept
Auth: protectUser
```

**No body required.**

**What happens on the server:**
1. Bid status → `accepted`, all other bids → `rejected`
2. User wallet deducted by bid amount (escrow hold)
3. Task status → `assigned`, `assignedTasker` set, `isEscrowHeld` = `true`
4. A `Transaction` record with `paymentPurpose: "escrow_hold"` is created
5. A system message is added to the chat conversation
6. Accepted tasker gets a push notification; rejected taskers also notified

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Bid accepted successfully",
  "bid": { "...": "..." }
}
```

**Error (402 — insufficient funds):**
```json
{
  "status": "error",
  "message": "Insufficient wallet balance to accept this bid"
}
```

> **Important:** User must have enough wallet balance ≥ bid amount BEFORE accepting. Show the user their balance and the bid amount on the UI.

---

## PHASE 5 — Chat (User ↔ Tasker)

### 5.1 Open / Get Conversation

```
POST /api/chat/conversations
Auth: protectAny
```

**Request Body (from User):**
```json
{
  "taskId": "taskObjectId",
  "bidId": "bidObjectId"
}
```
> Or use `taskerId` instead of `bidId`.

**Request Body (from Tasker):**
```json
{
  "taskId": "taskObjectId"
}
```
> Tasker must have an existing bid on the task.

**Success Response (200):**
```json
{
  "status": "success",
  "conversation": {
    "_id": "conversationId",
    "task": { "title": "...", "budget": 5000, "status": "assigned" },
    "user": { "fullName": "John Doe", "profilePicture": "..." },
    "tasker": { "firstName": "Ade", "lastName": "Johnson", "profilePicture": "..." }
  }
}
```

---

### 5.2 List Conversations

```
GET /api/chat/conversations
Auth: protectAny
```

---

### 5.3 Get Messages

```
GET /api/chat/conversations/:id/messages
Auth: protectAny
```

---

### 5.4 Send Message

```
POST /api/chat/conversations/:id/messages
Auth: protectAny
```

**Request Body:**
```json
{
  "text": "Hello, when can you start?"
}
```

---

### 5.5 Mark Messages as Read

```
POST /api/chat/conversations/:id/read
Auth: protectAny
```

---

## PHASE 6 — Task Execution & Completion

### 6.1 Tasker Starts the Task (assigned → in-progress)

```
PATCH /api/tasks/:id/status/tasker
Auth: protectTasker
```

**Request Body:**
```json
{
  "status": "in-progress"
}
```

**What happens:** A 6-digit completion code is generated and saved on the task. The code is **NOT** returned to the tasker.

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Task started. A completion code has been sent to the task poster.",
  "task": { "status": "in-progress", "...": "..." }
}
```

---

### 6.2 User Retrieves Completion Code

```
GET /api/tasks/:id/completion-code
Auth: protectUser (task poster only)
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "taskId": "taskObjectId",
    "completionCode": "482917"
  }
}
```

> Only available when task status is `in-progress`. The user should share this code with the tasker verbally or via chat after confirming the work is done.

**Error (400 — wrong status):**
```json
{
  "status": "error",
  "message": "Completion code is only available for in-progress tasks"
}
```

---

### 6.3 Tasker Submits Completion Code (in-progress → completed) ⚡

```
PATCH /api/tasks/:id/status/tasker
Auth: protectTasker
```

**Request Body:**
```json
{
  "status": "completed",
  "completionCode": "482917"
}
```

**What happens on the server:**
1. Code is validated against the stored code
2. Escrow is released: tasker gets `escrowAmount - 15% fee` credited to wallet
3. Task status → `completed`, `escrowStatus` → `released`
4. Three transaction records created: `escrow_release`, `platform_fee`
5. User receives a push notification that the task is completed
6. Completion code is wiped from the task

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Task completed and payout released",
  "task": {
    "status": "completed",
    "escrowAmount": 4500,
    "platformFee": 675,
    "taskerPayout": 3825,
    "escrowStatus": "released",
    "completedAt": "2026-03-16T15:00:00.000Z",
    "...": "..."
  }
}
```

**Error (400 — wrong code):**
```json
{
  "status": "error",
  "message": "Invalid completion code"
}
```

**Error (400 — missing code):**
```json
{
  "status": "error",
  "message": "Completion code is required to complete a task"
}
```

---

### 6.4 User Cancels a Task

```
PATCH /api/tasks/:id/status
Auth: protectUser
```

**Request Body:**
```json
{
  "status": "cancelled"
}
```

**Allowed from these statuses:**
| Current Status | What Happens |
|----------------|-------------|
| `open` | Task simply cancelled. No funds involved. |
| `assigned` | Escrow refunded to user wallet. Tasker notified. |
| `in-progress` | Escrow refunded to user wallet. Completion code cleared. Tasker notified. |

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Task cancelled and funds refunded",
  "task": { "status": "cancelled", "escrowStatus": "refunded", "...": "..." }
}
```

---

## PHASE 7 — Tasker Gets Paid & Withdraws

### 7.1 Check Tasker Wallet Balance

```
GET /api/wallet/tasker/balance
Auth: protectTasker
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "walletBalance": 3825,
    "withdrawableAmount": 3825,
    "canWithdraw": false,
    "nextWithdrawableAt": "2026-03-17T15:00:00.000Z",
    "minimumWithdrawal": 5000,
    "hasBankAccount": true,
    "hasPendingWithdrawal": false,
    "pendingWithdrawalAmount": 0
  }
}
```

**`canWithdraw` is `false` when:**
- Balance < ₦5,000 (`minimumWithdrawal`)
- Less than 24 hours since last completed task (see `nextWithdrawableAt`)
- There's already a pending/approved withdrawal

---

### 7.2 List Available Banks

```
GET /api/wallet/banks
Auth: protectTasker
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": [
    { "name": "Access Bank", "code": "044", "slug": "access-bank" },
    { "name": "GTBank", "code": "058", "slug": "gtbank" }
  ]
}
```

---

### 7.3 Set Bank Account

```
POST /api/wallet/tasker/bank-account
Auth: protectTasker
```

**Request Body:**
```json
{
  "accountNumber": "0123456789",
  "bankCode": "044"
}
```

> Account is verified via Paystack (account name is resolved automatically).

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Bank account saved successfully",
  "data": {
    "bankName": "Access Bank",
    "accountNumber": "0123456789",
    "accountName": "JOHN ADEWALE"
  }
}
```

---

### 7.4 Get Saved Bank Account

```
GET /api/wallet/tasker/bank-account
Auth: protectTasker
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "bankName": "Access Bank",
    "bankCode": "044",
    "accountNumber": "0123456789",
    "accountName": "JOHN ADEWALE"
  }
}
```

> Returns `"data": null` if no bank account is saved.

---

### 7.5 Request Withdrawal

```
POST /api/wallet/tasker/withdraw
Auth: protectTasker
```

**Request Body:**
```json
{
  "amount": 5000
}
```

**Validation rules:**
- Minimum: ₦5,000
- Must not exceed wallet balance
- Must have a saved bank account
- Must be 24+ hours since last completed task
- No existing pending/approved withdrawal

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Withdrawal request submitted. Awaiting admin approval.",
  "data": {
    "withdrawalId": "withdrawalObjectId",
    "amount": 5000,
    "status": "pending",
    "bankDetails": {
      "bankName": "Access Bank",
      "bankCode": "044",
      "accountNumber": "0123456789",
      "accountName": "JOHN ADEWALE"
    }
  }
}
```

> Withdrawal is manually approved by an admin. Once approved, payout is processed to the bank.

---

### 7.6 Withdrawal History

```
GET /api/wallet/tasker/withdrawals?page=1&limit=10
Auth: protectTasker
```

**Success Response (200):**
```json
{
  "status": "success",
  "results": 1,
  "totalRecords": 1,
  "totalPages": 1,
  "currentPage": 1,
  "withdrawals": [
    {
      "_id": "...",
      "amount": 5000,
      "status": "pending",
      "bankDetails": { "bankName": "Access Bank", "accountNumber": "0123456789", "accountName": "JOHN ADEWALE" },
      "createdAt": "2026-03-17T16:00:00.000Z"
    }
  ]
}
```

---

## Quick Reference — All Endpoints

| # | Method | Endpoint | Auth | Phase |
|---|--------|----------|------|-------|
| 1 | `POST` | `/api/wallet/fund/initialize` | User | Fund Wallet |
| 2 | `GET` | `/api/wallet/fund/verify?reference=...` | User | Fund Wallet |
| 3 | `GET` | `/api/wallet/user/balance` | User | Fund Wallet |
| 4 | `GET` | `/api/wallet/user/transactions` | User | Fund Wallet |
| 5 | `POST` | `/api/tasks` | User | Post Task |
| 6 | `GET` | `/api/tasks/user/tasks` | User | Post Task |
| 7 | `GET` | `/api/tasks/tasker/feed` | Tasker | Browse Tasks |
| 8 | `GET` | `/api/tasks/:id` | Public | View Task |
| 9 | `POST` | `/api/bids` | Tasker | Bid |
| 10 | `PUT` | `/api/bids/:id` | Tasker | Bid |
| 11 | `DELETE` | `/api/bids/:id` | Tasker | Bid |
| 12 | `GET` | `/api/bids/tasker/bids` | Tasker | Bid |
| 13 | `GET` | `/api/bids/task/:taskId` | User | Review Bids |
| 14 | `POST` | `/api/bids/:id/accept` | User | Accept Bid (Escrow) |
| 15 | `POST` | `/api/chat/conversations` | Any | Chat |
| 16 | `GET` | `/api/chat/conversations` | Any | Chat |
| 17 | `GET` | `/api/chat/conversations/:id` | Any | Chat |
| 18 | `GET` | `/api/chat/conversations/:id/messages` | Any | Chat |
| 19 | `POST` | `/api/chat/conversations/:id/messages` | Any | Chat |
| 20 | `POST` | `/api/chat/conversations/:id/read` | Any | Chat |
| 21 | `PATCH` | `/api/tasks/:id/status/tasker` | Tasker | Start / Complete Task |
| 22 | `GET` | `/api/tasks/:id/completion-code` | User | Completion |
| 23 | `PATCH` | `/api/tasks/:id/status` | User | Cancel Task |
| 24 | `GET` | `/api/wallet/tasker/balance` | Tasker | Payout |
| 25 | `GET` | `/api/wallet/banks` | Tasker | Payout |
| 26 | `POST` | `/api/wallet/tasker/bank-account` | Tasker | Payout |
| 27 | `GET` | `/api/wallet/tasker/bank-account` | Tasker | Payout |
| 28 | `POST` | `/api/wallet/tasker/withdraw` | Tasker | Withdraw |
| 29 | `GET` | `/api/wallet/tasker/withdrawals` | Tasker | Withdraw |

---

## Error Format (all endpoints)

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "details": "Optional extra info"
}
```

## Standard HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 402 | Insufficient wallet balance |
| 403 | Not authorized |
| 404 | Not found |
| 500 | Server error |
| 502 | Payment gateway error (Paystack) |
