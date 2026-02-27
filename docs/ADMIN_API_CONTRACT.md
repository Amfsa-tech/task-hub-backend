Here is the updated Markdown block containing the new **Category Management** section.

I have added it as Section 13. You can either copy this entire block and replace your current `API_DOCUMENTATION.md` file, or just copy Section 13 and paste it at the bottom of your existing file.

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
| --- | --- | --- | --- |
| **GET** | `/api/admin/staff/stats` | Staff hierarchy and count. | `super_admin` |
| **GET** | `/api/admin/staff` | List all admin/staff accounts. | `super_admin` |
| **POST** | `/api/admin/staff` | Create a new staff account. | `super_admin` |
| **GET** | `/api/admin/staff/:id` | Get specific staff member details. | `super_admin` |
| **PATCH** | `/api/admin/staff/:id/status` | Change staff active/inactive status. | `super_admin` |

---
## 13. Category Management (`/api/admin/categories`)

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/admin/categories` | Get top-level category stats (active/closed) and list of all categories with service counts. | `super_admin`, `operations`, `trust_safety` |
| **GET** | `/api/admin/categories/:id` | Get category drill-down details (revenue stats, list of recent tasks, and taskers). | `super_admin`, `operations`, `trust_safety` |
| **POST** | `/api/admin/categories` | Create a new category. Payload must include: `name`, `displayName`, `description`, `minimumPrice`. | `super_admin`, `operations` |
| **PATCH** | `/api/admin/categories/:id` | Update or toggle active status of a category. | `super_admin`, `operations` |
| **DELETE** | `/api/admin/categories/:id` | Delete a category. **Note:** Returns a `400` error if the category is actively assigned to any tasks or taskers. | `super_admin`, `operations` |

```


> *"Hey! I've updated the API documentation with the new **Category Management** routes (Section 13). You can use `GET /api/admin/categories/:id` to fetch the Revenue, Tasks, and Taskers all in a single request for the details page. **Important:** Make sure you pass `minimumPrice` in the JSON body when hitting the POST or PATCH endpoints for the Add/Edit modals, as I've updated the backend to support that new field from the Figma design!"*



```