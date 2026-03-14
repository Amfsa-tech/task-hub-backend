# Tasker Withdrawal Flow — Frontend Integration Guide

> **Base URL:** `/api`  
> **Auth:** All tasker endpoints require `Authorization: Bearer <tasker_jwt_token>`  
> **Currency:** NGN (Nigerian Naira). All amounts are in Naira (not kobo).

---

## Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TASK COMPLETION FLOW                            │
│                                                                     │
│  1. Tasker starts task → status becomes "in-progress"               │
│  2. 6-digit completion code generated → user retrieves it           │
│  3. User gives code to tasker (in person / chat)                    │
│  4. Tasker submits code → task "completed", escrow released         │
│     - 15% platform fee deducted                                     │
│     - 85% credited to tasker wallet                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     WITHDRAWAL FLOW                                 │
│                                                                     │
│  1. Tasker adds bank account (Paystack-verified)                    │
│  2. Tasker checks balance (must wait 24hr after last task)          │
│  3. Tasker requests withdrawal (min ₦5,000)                         │
│  4. Amount deducted from wallet immediately                         │
│  5. Admin reviews → approves or rejects                             │
│     - Approve → admin manually sends money to bank account          │
│     - Reject → amount refunded to wallet                            │
│  6. Admin marks withdrawal as completed after sending payout        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Task Completion (Earning Money)

### 1a. Tasker Starts Task

```
PATCH /api/tasks/:taskId/status/tasker
Authorization: Bearer <tasker_token>

Body:
{
  "status": "in-progress"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Task started. A completion code has been sent to the task poster.",
  "task": {
    "_id": "...",
    "status": "in-progress"
  }
}
```

> The `completionCode` is NOT included in this response. Only the task poster can retrieve it.

---

### 1b. User (Task Poster) Retrieves Completion Code

```
GET /api/tasks/:taskId/completion-code
Authorization: Bearer <user_token>
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "taskId": "664abc123...",
    "completionCode": "482917"
  }
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 403 | Not authorized to view this completion code |
| 400 | Completion code is only available for in-progress tasks |

> **UI Hint:** Show this code prominently on the user's task detail page. Instruct them to share it with the tasker only when satisfied with the work.

---

### 1c. Tasker Submits Completion Code

```
PATCH /api/tasks/:taskId/status/tasker
Authorization: Bearer <tasker_token>

Body:
{
  "status": "completed",
  "completionCode": "482917"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Task completed and payout released",
  "task": {
    "_id": "...",
    "status": "completed",
    "escrowAmount": 10000,
    "platformFee": 1500,
    "taskerPayout": 8500,
    "escrowStatus": "released",
    "completedAt": "2026-03-14T10:30:00.000Z"
  }
}
```

**Errors:**
| Status | Message |
|--------|---------|
| 400 | Completion code is required to complete a task |
| 400 | Invalid completion code |

> **Payout breakdown:** If escrow was ₦10,000 → platform fee = ₦1,500 (15%) → tasker receives ₦8,500

---

## 2. Bank Account Setup

### 2a. List Available Banks

```
GET /api/wallet/banks
Authorization: Bearer <tasker_token>
```

**Response (200):**
```json
{
  "status": "success",
  "data": [
    { "name": "Access Bank", "code": "044", "slug": "access-bank" },
    { "name": "GTBank", "code": "058", "slug": "guaranty-trust-bank" },
    { "name": "First Bank", "code": "011", "slug": "first-bank-of-nigeria" }
  ]
}
```

> **UI Hint:** Use this to populate a bank selection dropdown. Cache this list client-side (it rarely changes).

---

### 2b. Add / Update Bank Account

```
POST /api/wallet/tasker/bank-account
Authorization: Bearer <tasker_token>

Body:
{
  "accountNumber": "0123456789",
  "bankCode": "058"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Bank account saved successfully",
  "data": {
    "bankName": "GTBank",
    "accountNumber": "0123456789",
    "accountName": "JOHN DOE"
  }
}
```

**Errors:**
| Status | Message | Cause |
|--------|---------|-------|
| 400 | Account number and bank code are required | Missing fields |
| 400 | Account number must be 10 digits | Invalid format |
| 400 | Could not verify bank account. | Paystack couldn't resolve the account (wrong number/bank) |
| 400 | Could not set up bank account for transfers. | Paystack recipient creation failed |

> **UI Flow:**  
> 1. User selects bank from dropdown (from `/banks`)  
> 2. User enters 10-digit account number  
> 3. Call this endpoint → it auto-resolves the account name via Paystack  
> 4. Show the returned `accountName` for confirmation  

---

### 2c. Get Saved Bank Account

```
GET /api/wallet/tasker/bank-account
Authorization: Bearer <tasker_token>
```

**Response (200) — has account:**
```json
{
  "status": "success",
  "data": {
    "bankName": "GTBank",
    "bankCode": "058",
    "accountNumber": "0123456789",
    "accountName": "JOHN DOE"
  }
}
```

**Response (200) — no account:**
```json
{
  "status": "success",
  "data": null
}
```

---

## 3. Wallet Balance

### Get Balance & Withdrawal Eligibility

```
GET /api/wallet/tasker/balance
Authorization: Bearer <tasker_token>
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "walletBalance": 25000,
    "withdrawableAmount": 25000,
    "canWithdraw": true,
    "nextWithdrawableAt": null,
    "minimumWithdrawal": 5000,
    "hasBankAccount": true,
    "hasPendingWithdrawal": false,
    "pendingWithdrawalAmount": 0
  }
}
```

**Field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `walletBalance` | number | Total wallet balance in Naira |
| `withdrawableAmount` | number | Amount available to withdraw right now (0 if within 24hr cooldown) |
| `canWithdraw` | boolean | `true` if tasker can request a withdrawal right now |
| `nextWithdrawableAt` | string\|null | ISO timestamp of when withdrawal becomes available (if in cooldown) |
| `minimumWithdrawal` | number | Minimum withdrawal amount (₦5,000) |
| `hasBankAccount` | boolean | Whether tasker has a saved bank account |
| `hasPendingWithdrawal` | boolean | Whether there's an active withdrawal request |
| `pendingWithdrawalAmount` | number | Amount locked in pending withdrawal (0 if none) |

**When `canWithdraw` is `false`, possible reasons (check in order):**

1. `hasPendingWithdrawal === true` → "You have a pending withdrawal"
2. `nextWithdrawableAt !== null` → "Withdraw available at {time}" (24hr cooldown)
3. `withdrawableAmount < minimumWithdrawal` → "Minimum ₦5,000 required"
4. `hasBankAccount === false` → "Add a bank account first"

---

## 4. Request Withdrawal

```
POST /api/wallet/tasker/withdraw
Authorization: Bearer <tasker_token>

Body:
{
  "amount": 15000
}
```

**Response (201):**
```json
{
  "status": "success",
  "message": "Withdrawal request submitted. Awaiting admin approval.",
  "data": {
    "withdrawalId": "664def456...",
    "amount": 15000,
    "status": "pending",
    "bankDetails": {
      "bankName": "GTBank",
      "bankCode": "058",
      "accountNumber": "0123456789",
      "accountName": "JOHN DOE"
    }
  }
}
```

**Errors:**
| Status | Message | Cause |
|--------|---------|-------|
| 400 | Minimum withdrawal amount is ₦5,000 | Amount too low |
| 400 | Insufficient wallet balance | Amount exceeds wallet |
| 400 | Please add a bank account before requesting a withdrawal | No bank account |
| 400 | You can withdraw after {ISO date}. Must wait 24 hours after last completed task. | 24hr cooldown active |
| 400 | You already have a pending withdrawal request | Existing pending/approved/processing withdrawal |

> **Important:** The withdrawal amount is **deducted from the wallet immediately** when the request is created. If admin rejects, it gets refunded automatically. An admin must manually send the payout and then mark the withdrawal as completed.

---

## 5. Withdrawal History

```
GET /api/wallet/tasker/withdrawals?page=1&limit=10
Authorization: Bearer <tasker_token>
```

**Response (200):**
```json
{
  "status": "success",
  "results": 2,
  "totalRecords": 2,
  "totalPages": 1,
  "currentPage": 1,
  "withdrawals": [
    {
      "_id": "664def456...",
      "tasker": "664abc789...",
      "amount": 15000,
      "status": "completed",
      "bankDetails": {
        "bankName": "GTBank",
        "bankCode": "058",
        "accountNumber": "0123456789",
        "accountName": "JOHN DOE"
      },
      "reviewedAt": "2026-03-14T12:00:00.000Z",
      "completedAt": "2026-03-14T12:01:00.000Z",
      "createdAt": "2026-03-14T10:30:00.000Z",
      "updatedAt": "2026-03-14T12:01:00.000Z"
    },
    {
      "_id": "664def789...",
      "tasker": "664abc789...",
      "amount": 5000,
      "status": "rejected",
      "bankDetails": { ... },
      "rejectionReason": "Suspicious activity detected",
      "reviewedAt": "2026-03-13T08:00:00.000Z",
      "createdAt": "2026-03-13T06:00:00.000Z",
      "updatedAt": "2026-03-13T08:00:00.000Z"
    }
  ]
}
```

**Withdrawal status values:**

| Status | Meaning | UI Treatment |
|--------|---------|-------------|
| `pending` | Awaiting admin review | Yellow badge, "Under Review" |
| `approved` | Admin approved, payout being sent manually | Blue badge, "Approved" |
| `completed` | Admin confirmed money was sent | Green badge, "Completed" |
| `rejected` | Admin rejected (check `rejectionReason`) | Red badge, "Rejected" |

---

## Withdrawal Status Flow Diagram

```
  ┌─────────┐
  │ pending  │──── Admin rejects ────→ rejected (wallet refunded)
  └────┬─────┘
       │ Admin approves
       ▼
  ┌──────────┐
  │ approved │──── Admin rejects ────→ rejected (wallet refunded)
  └────┬─────┘
       │ Admin sends payout manually, then marks complete
       ▼
  ┌───────────┐
  │ completed │ ✓
  └───────────┘
```

---

## Frontend Integration Checklist

### Tasker Wallet Screen
- [ ] Call `GET /wallet/tasker/balance` on mount
- [ ] Show `walletBalance` prominently
- [ ] Show `withdrawableAmount` (may differ from balance during cooldown)
- [ ] If `canWithdraw === false`, show appropriate reason (see logic above)
- [ ] Show "Add Bank Account" prompt if `hasBankAccount === false`
- [ ] Show pending withdrawal banner if `hasPendingWithdrawal === true` with amount
- [ ] "Withdraw" button → validate amount ≥ 5,000, ≤ `withdrawableAmount`

### Bank Account Setup
- [ ] Fetch bank list from `GET /wallet/banks` (cache it)
- [ ] Bank selection dropdown + account number input (10 digits)
- [ ] On submit → `POST /wallet/tasker/bank-account`
- [ ] Show resolved `accountName` for user confirmation
- [ ] Show current account via `GET /wallet/tasker/bank-account`

### Task Completion (User Side)
- [ ] Show completion code on in-progress task detail: `GET /tasks/:id/completion-code`
- [ ] Instruct user: "Share this code with your tasker when the job is done"

### Task Completion (Tasker Side)
- [ ] Show input field for completion code on in-progress tasks
- [ ] Submit: `PATCH /tasks/:id/status/tasker` with `{ status: "completed", completionCode: "..." }`
- [ ] Show payout breakdown on success (escrow, platform fee, net payout)

### Withdrawal History
- [ ] `GET /wallet/tasker/withdrawals` with pagination
- [ ] Status badges with colors (see table above)
- [ ] Show `rejectionReason` for rejected withdrawals
- [ ] Show `completedAt` for completed withdrawals

---

## Error Response Format

All errors follow this structure:
```json
{
  "status": "error",
  "message": "Human-readable error message"
}
```

Some errors include additional fields:
```json
{
  "status": "error",
  "message": "Cannot change status from assigned to completed",
  "details": "Allowed transitions: in-progress"
}
```

---

## Business Rules Summary

| Rule | Value |
|------|-------|
| Platform fee | 15% (deducted at task completion) |
| Minimum withdrawal | ₦5,000 |
| Withdrawal cooldown | 24 hours after last completed task |
| Concurrent withdrawals | 1 at a time (pending/approved/processing) |
| Wallet deduction timing | Immediately on withdrawal request |
| Rejection refund | Automatic — full amount back to wallet (from both pending and approved) |
| Completion code | 6 digits, generated when task starts, required to complete |
