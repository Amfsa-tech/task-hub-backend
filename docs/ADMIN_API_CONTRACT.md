Here is the fully updated REST API Documentation. I have added all the new endpoints, query parameters, payloads, and automated backend behaviors we just built (including the 15/85 math, location/category analytics, KYC/Email filters, custom emails, Tasker locking, Task refund automation, and Notification resending). 

You can copy and paste this directly to your frontend developer:

***

```markdown
# TaskHub Admin Dashboard: REST API Documentation

This documentation provides the frontend team with the complete, fully-mapped backend endpoints for the TaskHub Admin Panel, including recent feature updates for analytics, moderation, and automated communications.

## 1. Global Specifications

### Authentication
All admin endpoints require a valid JWT passed in the Authorization header.
* **Header:** `Authorization: Bearer <ADMIN_JWT_TOKEN>`

### Role-Based Access Control (RBAC)
The API strictly enforces role-based access. Attempting to access an endpoint without the required role will return a `403 Forbidden` error.
* `super_admin`: Full system access, required for exports, settings, and staff management.
* `operations`: Task moderation, tasker approvals, category management.
* `trust_safety`: User moderation, dispute resolution, read-only system stats.
* `support`: Communication handling, sending emails, triggering notifications.

### Standard Error Response
```json
{
  "status": "error",
  "message": "Human-readable explanation"
}
```

---

## 2. Authentication & Profile (`/api/admin/auth` & `/api/admin/me`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **POST** | `/api/admin/auth/login` | Admin login (Requires `{"email": "...", "password": "..."}`) | None |
| **GET** | `/api/admin/me` | Get current admin profile | All Admins |
| **GET** | `/api/admin/me/system-stats` | Get high-level system checks | `super_admin` |

---

## 3. Dashboard (`/api/admin/dashboard`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/dashboard/stats` | Fetches aggregate data for homepage cards, quick stats, and chart analytics. | `super_admin`, `operations`, `trust_safety` |

**Dashboard Stats Response Structure (Updated):**
```json
{
  "status": "success",
  "data": {
    "cards": {
      "totalUsers": 150, "totalTaskers": 45, "totalTasks": 320,
      "activeTasks": 12, "completedTasks": 280, "cancelledTasks": 28, "pendingKyc": 5,
      "totalTransaction": 450000, 
      "totalRevenue": 67500,     // 15% commission on completed tasks
      "escrowHeld": 20000,       // Active tasks only
      "outgoingFees": 382500     // 85% paid out to taskers on completed tasks
    },
    "quickStats": { "userToTaskerRatio": "3.33", "completionRate": "87.5", "avgTaskValue": "1500" },
    "analytics": {
      "locations": [ { "state": "Lagos", "taskCount": 45 } ],
      "categories": [ { "categoryName": "Home Cleaning", "taskerCount": 22 } ]
    },
    "growth": 24,
    "recentTasks": [...],
    "recentActivity": [...]
  }
}
```

---

## 4. User Management (`/api/admin/users`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/users/stats` | Get top-level user statistics. | `super_admin`, `trust_safety` |
| **GET** | `/api/admin/users` | List all users. Supports queries: `?page=X&limit=Y&search=term&status=active|suspended&kycVerified=true|false&emailVerified=true|false`. | `super_admin`, `trust_safety` |
| **GET** | `/api/admin/users/:id` | View specific user details. | `super_admin`, `trust_safety` |
| **PATCH** | `/api/admin/users/:id/activate` | Mark user as active. | `super_admin` |
| **PATCH** | `/api/admin/users/:id/deactivate` | Mark user as inactive. | `super_admin` |
| **PATCH** | `/api/admin/users/:id/lock` | Temporarily lock account for 24 hours. | `super_admin`, `trust_safety` |
| **PATCH** | `/api/admin/users/:id/unlock` | Remove account lock. | `super_admin`, `trust_safety` |
| **DELETE** | `/api/admin/users/:id` | Soft delete user account. | `super_admin` |
| **PATCH** | `/api/admin/users/:id/restore` | Restore soft-deleted account. | `super_admin` |
| **POST** | `/api/admin/users/:id/send-email` | Sends branded email & in-app notification. Requires `{"subject": "...", "message": "..."}`. | `super_admin`, `operations`, `support` |

---

## 5. Tasker Management (`/api/admin/taskers`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/taskers` | List taskers. Queries: `?page=X&limit=Y&search=term&status=active|suspended&kycVerified=true|false&emailVerified=true|false&sort=rating`. | All Admins |
| **GET** | `/api/admin/taskers/:id` | View specific tasker details. | All Admins |
| **PATCH** | `/api/admin/taskers/:id/verify` | Manually verify tasker profile. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/taskers/:id/suspend` | Suspend tasker. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/taskers/:id/activate` | Activate suspended tasker. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/taskers/:id/lock` | Temporarily lock account for 24 hours. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/taskers/:id/unlock` | Remove account lock. | `super_admin`, `operations` |
| **POST** | `/api/admin/taskers/:id/send-email` | Sends branded email & in-app notification. Requires `{"subject": "...", "message": "..."}`. | `super_admin`, `operations`, `support` |

---

## 6. KYC Verification (`/api/admin/kyc`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/kyc/stats` | Get KYC aggregate statistics. | `super_admin` |
| **GET** | `/api/admin/kyc` | List KYC requests (Query: `?status=pending`). | `super_admin` |
| **PATCH** | `/api/admin/kyc/:id/approve` | Approve KYC document. | `super_admin` |
| **PATCH** | `/api/admin/kyc/:id/reject` | Reject KYC (Requires `{"reason": "string"}` body). | `super_admin` |

---

## 7. Task Management (`/api/admin/tasks`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/tasks/stats` | Get task analytics. | All Admins |
| **GET** | `/api/admin/tasks` | List all tasks. | All Admins |
| **GET** | `/api/admin/tasks/:id` | Get specific task details. | All Admins |
| **PATCH** | `/api/admin/tasks/:id/cancel` | **Automated Engine:** Cancels task, auto-refunds User's wallet, creates Transaction record, and emails User (`reason`) and all bidding Taskers. Requires `{"reason": "..."}`. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/tasks/:id/complete` | Force complete a task (escrow release). | `super_admin`, `operations` |

---

## 8. Financials & Payments (`/api/admin/payments`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/payments/stats` | Get payment/escrow stats (Calculates exactly via 15/85 revenue rule). | All Admins |
| **GET** | `/api/admin/payments` | List all financial transactions. | All Admins |
| **GET** | `/api/admin/payments/:id` | Get specific transaction receipt. | All Admins |

---

## 9. Moderation, Reports & Activity Logs (`/api/admin/reports`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/reports` | List all user disputes/reports. | `super_admin`, `trust_safety` |
| **GET** | `/api/admin/reports/activity-logs` | Fetch system-wide activity timeline. | All Admins |
| **GET** | `/api/admin/reports/:id` | Get dispute details. | All Admins |
| **PATCH** | `/api/admin/reports/:id/resolve` | Mark report as resolved. | `super_admin`, `trust_safety` |

### System Data Exports

* `GET /api/admin/reports/export/dashboard` (`super_admin`)
* `GET /api/admin/reports/export/tasks` (`super_admin`)
* `GET /api/admin/reports/export/payments` (`super_admin`)
* `GET /api/admin/reports/export/users` (`super_admin`)
* `GET /api/admin/reports/export/taskers` (`super_admin`)

---

## 10. Messages & Support (`/api/admin/messages`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/messages/stats` | Get chat volume and unread stats. | All Admins |
| **GET** | `/api/admin/messages` | List all monitored conversations. | All Admins |
| **GET** | `/api/admin/messages/:id` | View chat history for a specific conversation. | All Admins |
| **POST** | `/api/admin/messages/:id` | Send an Admin System message (Requires `{"text": "string"}`). | All Admins |

---

## 11. System Settings (`/api/admin/settings`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/settings` | Fetch global toggles (Maintenance mode, etc.). | `super_admin` |
| **PATCH** | `/api/admin/settings` | Update settings (e.g., `{"system.maintenanceMode": true}`). | `super_admin` |

---

## 12. Staff Management (`/api/admin/staff`)

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/staff/stats` | Staff hierarchy and count. | `super_admin` |
| **GET** | `/api/admin/staff` | List all admin/staff accounts. | `super_admin` |
| **POST** | `/api/admin/staff/invite` | Sends an email invitation. Payload: `email`, `role`. | `super_admin` |
| **POST** | `/api/admin/staff/setup` | **PUBLIC ROUTE (No Auth Required).** Finalizes account creation. Payload: `token`, `firstName`, `lastName`, `password`. | None (Public) |
| **GET** | `/api/admin/staff/:id` | Get specific staff member details. | `super_admin` |
| **PATCH** | `/api/admin/staff/:id/status` | Change staff active/inactive status. | `super_admin` |

---

## 13. Category Management (`/api/admin/categories`)

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/categories` | Get top-level stats and list of all main categories. | `super_admin`, `operations`, `trust_safety` |
| **GET** | `/api/admin/categories/:id` | Get category drill-down details (subCategories, tasks, taskers). | `super_admin`, `operations`, `trust_safety` |
| **POST** | `/api/admin/categories` | Create category/subcategory. Payload: `name`, `displayName`. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/categories/:id` | Update category details or status. | `super_admin`, `operations` |
| **DELETE** | `/api/admin/categories/:id` | Delete category. | `super_admin`, `operations` |

---

## 14. Notification Management (`/api/admin/notifications`)

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/notifications/stats` | Fetches aggregate analytics for notifications. | `super_admin`, `operations`, `support` |
| **GET** | `/api/admin/notifications` | Retrieves chronological list of broadcasted notifications. | `super_admin`, `operations`, `support` |
| **GET** | `/api/admin/notifications/all-users` | Fetches individual user/tasker notifications. | `super_admin`, `operations`, `support` |
| **POST** | `/api/admin/notifications/send` | Broadcasts new notification (In-app + Email blast). Payload: `title`, `message`, `audience`, `selectedUserIds` (optional). | `super_admin`, `operations`, `support` |
| **POST** | `/api/admin/notifications/:id/resend` | Re-evaluates audience and triggers another email blast/in-app ping for a previously sent notification ID. | `super_admin`, `operations`, `support` |

---

## 15. Withdrawal Management & Crypto Payouts (`/api/admin/withdrawals`)

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/withdrawals/stats` | Fetches aggregate withdrawal analytics. | `super_admin`, `operations` |
| **GET** | `/api/admin/withdrawals` | Lists all withdrawal requests. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/withdrawals/:id/approve` | **Automated Engine:** Signs/broadcasts XLM instantly or approves Bank manual payment. | `super_admin` |
| **PATCH** | `/api/admin/withdrawals/:id/reject` | Rejects request and **automatically refunds** NGN back to Tasker's wallet. Requires `{"reason": "string"}`. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/withdrawals/:id/complete` | Manual override to mark Bank withdrawal finished. | `super_admin`, `operations` |

---

## 16. User & Tasker Wallet (`/api/wallet`)

*Note: All endpoints here require the standard User or Tasker JWT via `protectAny` middleware.*

| Method | Endpoint | Description | Target |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/wallet/fund/initialize` | Initialize Paystack funding. Returns Auth URL. | User |
| **GET** | `/api/wallet/fund/verify` | Verify Paystack payment. | User |
| **GET** | `/api/wallet/user/balance` | Get wallet balance and escrow totals. | User |
| **GET** | `/api/wallet/user/transactions` | List history. Queries: `?page=X&limit=Y&purpose=wallet_funding`. | User |
| **GET** | `/api/wallet/stellar/deposit-info` | Get Master Public Key and User's unique Memo ID. | User/Tasker |
| **POST** | `/api/wallet/withdraw` | Submit withdrawal request. Deducts balance. | Tasker |
| **POST** | `/api/wallet/tasker/pin/setup` | Setup/reset 4-digit transaction PIN. | Tasker |
| **GET** | `/api/wallet/tasker/balance` | Get wallet balance, pending withdrawals. | Tasker |
| **GET** | `/api/wallet/tasker/transactions` | List Tasker transaction history. | Tasker |
```