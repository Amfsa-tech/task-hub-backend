```markdown
# TaskHub Admin Dashboard: REST API Documentation

This documentation provides the frontend team with the complete, fully-mapped backend endpoints for the TaskHub Admin Panel.

## 1. Global Specifications

### Authentication
All admin endpoints require a valid JWT passed in the Authorization header.
* **Header:** `Authorization: Bearer <ADMIN_JWT_TOKEN>`

### Role-Based Access Control (RBAC)
The API strictly enforces role-based access. Attempting to access an endpoint without the required role will return a `403 Forbidden` error.
* `super_admin`: Full system access, required for exports, settings, and staff management.
* `operations`: Task moderation, tasker approvals, category management.
* `trust_safety`: User moderation, dispute resolution, read-only system stats.

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
| **GET** | `/api/admin/dashboard/stats` | Fetches aggregate data for homepage cards (Users, Tasks, Escrow, KYC). | `super_admin`, `operations`, `trust_safety` |

---

## 4. User Management (`/api/admin/users`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/users/stats` | Get top-level user statistics. | `super_admin`, `trust_safety` |
| **GET** | `/api/admin/users` | List all users (supports pagination/search). | `super_admin`, `trust_safety` |
| **GET** | `/api/admin/users/:id` | View specific user details. | `super_admin`, `trust_safety` |
| **PATCH** | `/api/admin/users/:id/activate` | Mark user as active. | `super_admin` |
| **PATCH** | `/api/admin/users/:id/deactivate` | Mark user as inactive. | `super_admin` |
| **PATCH** | `/api/admin/users/:id/lock` | Temporarily lock account. | `super_admin`, `trust_safety` |
| **PATCH** | `/api/admin/users/:id/unlock` | Remove account lock. | `super_admin`, `trust_safety` |
| **DELETE** | `/api/admin/users/:id` | Soft delete user account. | `super_admin` |
| **PATCH** | `/api/admin/users/:id/restore` | Restore soft-deleted account. | `super_admin` |

---

## 5. Tasker Management (`/api/admin/taskers`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/taskers` | List all taskers. | All Admins |
| **GET** | `/api/admin/taskers/:id` | View specific tasker details. | All Admins |
| **PATCH** | `/api/admin/taskers/:id/verify` | Manually verify tasker profile. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/taskers/:id/suspend` | Suspend tasker. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/taskers/:id/activate` | Activate suspended tasker. | `super_admin`, `operations` |

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
| **PATCH** | `/api/admin/tasks/:id/cancel` | Force cancel a task. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/tasks/:id/complete` | Force complete a task (escrow release). | `super_admin`, `operations` |

---

## 8. Financials & Payments (`/api/admin/payments`)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| **GET** | `/api/admin/payments` | Get payment/escrow stats (Cards/Widgets). | All Admins |
| **GET** | `/api/admin/payments/history` | List all financial transactions. | All Admins |
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
| **GET** | `/api/admin/staff/stats` | Staff hierarchy and count (Active today, Total, Super Admins). | `super_admin` |
| **GET** | `/api/admin/staff` | List all admin/staff accounts. Supports `?search=` and `?status=` queries. | `super_admin` |
| **POST** | `/api/admin/staff/invite` | Sends an email invitation with a secure setup token. Payload requires `email` and `role`. | `super_admin` |
| **POST** | `/api/admin/staff/setup` | **PUBLIC ROUTE (No Auth Required).** Finalizes account creation from the email link. Payload requires `token` (from URL), `firstName`, `lastName`, and `password`. | None (Public) |
| **GET** | `/api/admin/staff/:id` | Get specific staff member details, including their recent activity logs and permissions. | `super_admin` |
| **PATCH** | `/api/admin/staff/:id/status` | Change staff active/inactive status. Payload requires `{"isActive": boolean}`. | `super_admin` |


---
## 13. Category Management (`/api/admin/categories`)

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/categories` | Get top-level stats (Main Categories only) and list of all main categories with `subCategoryCount` and total services. | `super_admin`, `operations`, `trust_safety` |
| **GET** | `/api/admin/categories/:id` | Get category drill-down details (including its `subCategories` list, aggregated revenue, tasks, and taskers). | `super_admin`, `operations`, `trust_safety` |
| **POST** | `/api/admin/categories` | Create a new category. Payload: `name`, `displayName`. Optional: `description`, `minimumPrice`, `parentCategory` (pass a Main Category ID here to create a Subcategory). | `super_admin`, `operations` |
| **PATCH** | `/api/admin/categories/:id` | Update category details, toggle `isActive` status, or reassign `parentCategory`. | `super_admin`, `operations` |
| **DELETE** | `/api/admin/categories/:id` | Delete a category. **Note:** Returns a `400` error if it contains subcategories or is actively assigned to any tasks/taskers. | `super_admin`, `operations` |

---

## 14. Notification Management (`/api/admin/notifications`)

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/notifications/stats` | Fetches aggregate analytics for the notification dashboard, including `totalSent` and global `openRate`. | `super_admin`, `operations`, `support` |
| **GET** | `/api/admin/notifications` | Retrieves a chronological list of all broadcasted notifications for the "Sent Notifications" table. Includes sender details. | `super_admin`, `operations`, `support` |
| **POST** | `/api/admin/notifications/send` | Broadcasts a new notification. Payload requires `title`, `message`, and `audience` (Options: 'All Users', 'All Taskers', 'Everyone', 'Selected Users'). Optional: `type`, `selectedUserIds`. | `super_admin`, `operations`, `support` |



---

## 15. Withdrawal Management & Crypto Payouts (`/api/admin/withdrawals`)

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/withdrawals/stats` | Fetches aggregate withdrawal analytics (Pending, Processing, Approved, Total NGN Paid). | `super_admin`, `operations` |
| **GET** | `/api/admin/withdrawals` | Lists all withdrawal requests. Supports filtering by `status`, `payoutMethod` (Bank/Stellar), and `search`. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/withdrawals/:id/approve` | **Automated Engine:** If payout is Stellar, it signs/broadcasts XLM to the blockchain instantly. If Bank, marks as approved for manual payment. | `super_admin` |
| **PATCH** | `/api/admin/withdrawals/:id/reject` | Rejects request and **automatically refunds** NGN back to the Tasker's wallet. Requires `{"reason": "string"}`. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/withdrawals/:id/complete` | Manual override to mark a Bank withdrawal as finished. (Crypto withdrawals auto-complete). | `super_admin`, `operations` |

---

## 16. User & Tasker Wallet (`/api/wallet`)

*Note: All endpoints here require the standard User or Tasker JWT via `protectAny` middleware.*

| Method | Endpoint | Description | Target |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/wallet/fund/initialize` | Initialize Paystack funding. Returns Auth URL and access code. | User |
| **GET** | `/api/wallet/fund/verify` | Verify Paystack payment. Requires `?reference=` query parameter. | User |
| **GET** | `/api/wallet/user/balance` | Get wallet balance and active escrow totals. | User |
| **GET** | `/api/wallet/user/transactions` | List history. Queries: `?page=X&limit=Y&purpose=wallet_funding`. | User |
| **GET** | `/api/wallet/stellar/deposit-info` | Get Master Public Key and User's unique Memo ID for crypto deposits. | User/Tasker |
| **POST** | `/api/wallet/withdraw` | Submit withdrawal request (Stellar or Bank Transfer). Deducts balance. | Tasker |
| **POST** | `/api/wallet/tasker/pin/setup` | Setup or reset 4-digit transaction PIN. | Tasker |
| **GET** | `/api/wallet/tasker/balance` | Get wallet balance, pending withdrawals, and available cash. | Tasker |
| **GET** | `/api/wallet/tasker/transactions` | List Tasker transaction history. Queries: `?page=X&limit=Y`. | Tasker |


### Key Payloads for Frontend (Wallet Endpoints)

**Initialize Funding (`POST /api/wallet/fund/initialize`)**
```json
{
  "amount": 5000 
}
```
*(Note: Amount is expected in Naira. Backend automatically converts to kobo for Paystack. Minimum is ₦100).*

**Setup Transaction PIN (`POST /api/wallet/tasker/pin/setup`)**
```json
{
  "pin": "1234",
  "password": "current_account_password"
}
```

**Request Withdrawal (Crypto) (`POST /api/wallet/withdraw`)**
```json
{
  "amount": 10000,
  "payoutMethod": "stellar_crypto",
  "transactionPin": "1234",
  "stellarAddress": "GBX..."
}
```

**Request Withdrawal (Bank Transfer) (`POST /api/wallet/withdraw`)**
```json
{
  "amount": 10000,
  "payoutMethod": "bank_transfer",
  "transactionPin": "1234",
  "bankDetails": {
    "accountNumber": "0123456789",
    "bankName": "GTBank",
    "accountName": "John Doe"
  }
}
```
```