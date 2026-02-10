AUTHENTICATION (GLOBAL)

All admin endpoints require:

Authorization: Bearer <ADMIN_JWT_TOKEN>

Admin Roles

super_admin → full access

admin → limited access (no approvals)

If token is missing or invalid:

401 Unauthorized


If role is insufficient:

403 Forbidden

DASHBOARD
GET Admin Dashboard Statistics

Endpoint

GET /api/admin/dashboard


Description
Returns high-level platform statistics for admin homepage.

Response – 200

{
  "status": "success",
  "data": {
    "users": {
      "total": 1200,
      "active": 980
    },
    "tasks": {
      "total": 450,
      "open": 120,
      "completed": 280,
      "cancelled": 50
    },
    "reports": {
      "pending": 12,
      "resolved": 40,
      "dismissed": 8
    },
    "escrow": {
      "totalHeld": 250000
    },
    "kyc": {
      "total": 300,
      "pending": 45,
      "approved": 230,
      "rejected": 25
    }
  }
}

KYC MANAGEMENT
GET All KYC Requests

Endpoint

GET /api/admin/kyc


Query Params

Name	Type	Description
status	string	pending, approved, rejected

Response – 200

{
  "status": "success",
  "count": 2,
  "records": [
    {
      "_id": "65fabc...",
      "user": {
        "_id": "64de...",
        "fullName": "John Doe",
        "emailAddress": "john@email.com"
      },
      "nin": "***********",
      "status": "pending",
      "createdAt": "2025-02-01T10:22:00Z"
    }
  ]
}


NIN must always be masked

PATCH Approve KYC

Endpoint

PATCH /api/admin/kyc/:id/approve


Role Required

super_admin


Response – 200

{
  "status": "success",
  "message": "KYC approved successfully"
}


Side Effects

User isKYCVerified = true

Push notification sent

In-app notification saved

Admin action logged

PATCH Reject KYC

Endpoint

PATCH /api/admin/kyc/:id/reject


Request Body

{
  "reason": "Document mismatch"
}


Response – 200

{
  "status": "success",
  "message": "KYC rejected"
}


Side Effects

Rejection reason saved

User notified

Admin action logged

KYC STATISTICS
GET KYC Stats (Dashboard Widget)

Endpoint

GET /api/admin/kyc/stats


Response – 200

{
  "status": "success",
  "data": {
    "total": 300,
    "pending": 45,
    "approved": 230,
    "rejected": 25
  }
}

USER MANAGEMENT (READ-ONLY)
GET All Users

Endpoint

GET /api/admin/users


Response – 200

{
  "status": "success",
  "count": 2,
  "users": [
    {
      "_id": "64de...",
      "fullName": "Jane Doe",
      "email": "jane@email.com",
      "role": "user",
      "isKYCVerified": true,
      "createdAt": "2024-12-10T09:00:00Z"
    }
  ]
}

REPORTS & MODERATION
GET Reports

Endpoint

GET /api/admin/reports?status=pending


Response – 200

{
  "status": "success",
  "count": 5,
  "reports": [
    {
      "_id": "77ab...",
      "type": "task_abuse",
      "status": "pending",
      "createdAt": "2025-01-30T18:00:00Z"
    }
  ]
}

ERROR RESPONSE FORMAT (GLOBAL)

All errors follow this structure:

{
  "status": "error",
  "message": "Human-readable explanation"
}

NOTIFICATIONS (USER-FACING)

Triggered automatically on:

KYC approval

KYC rejection

Task cancellation

Task completion disputes

Admin does not receive push notifications.

SECURITY RULES

No raw NIN returned

No sensitive tokens exposed

All admin actions logged

Role guards enforced at route level


