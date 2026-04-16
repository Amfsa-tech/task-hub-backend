# NIN Submission (Manual Review)

A lightweight alternative to the Didit identity verification flow. Users or Taskers submit their NIN and full name once — an admin reviews and approves/rejects it later.

Use this when the Didit SDK flow is unavailable, unsupported on the client platform, or you want a simpler fallback.

## Endpoint

```
POST /api/nin/submit-nin
```

## Authentication

Requires a valid **User** or **Tasker** JWT token in the `Authorization` header.

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

## Request Body

| Field      | Type   | Required | Description                        |
|------------|--------|----------|------------------------------------|
| `nin`      | string | Yes      | 11-digit National Identity Number  |
| `fullName` | string | Yes      | Tasker's full legal name           |

```json
{
  "nin": "12345678901",
  "fullName": "Adewale Okonkwo"
}
```

## Responses

### 201 — Submitted

```json
{
  "status": "success",
  "message": "NIN submitted successfully. It will be reviewed shortly.",
  "kycId": "664a1f..."
}
```

### 400 — Validation Error

```json
{
  "status": "error",
  "message": "nin and fullName are required"
}
```

```json
{
  "status": "error",
  "message": "NIN must be exactly 11 digits"
}
```

### 401 — Unauthorized

Returned when the JWT is missing, expired, or invalid.

### 409 — Already Submitted

```json
{
  "status": "error",
  "message": "NIN has already been submitted"
}
```

## Client Integration

### React Native / Expo

```js
const submitNIN = async (nin, fullName, token) => {
  const res = await fetch('https://api.ngtaskhub.com/api/nin/submit-nin', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nin, fullName }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message);
  }

  return data; // { status, message, kycId }
};
```

### Axios

```js
import axios from 'axios';

const submitNIN = (nin, fullName, token) =>
  axios.post(
    '/api/nin/submit-nin',
    { nin, fullName },
    { headers: { Authorization: `Bearer ${token}` } }
  );
```

## Flow

```
User or Tasker enters NIN + full name
        ↓
  POST /api/nin/submit-nin
        ↓
  Server stores masked NIN (e.g. 123****8901) as Pending
        ↓
  Admin reviews via admin KYC panel
        ↓
  Approved → user.isKYCVerified / tasker.isKYCVerified = true
  Rejected → user/tasker notified with reason
```

## Notes

- **One-time only** — a user or tasker cannot resubmit after the first submission.
- **No third-party API call** — the NIN is not verified in real-time. It is stored (masked) for admin review.
- **Privacy** — the raw NIN is never persisted. Only the masked form (`123****8901`) is saved.
- **Didit alternative** — use this endpoint when the Didit SDK session flow isn't viable on the client. Both flows write to the same `KYCVerification` model, so admin tooling works identically.
- **User type detection** — the server automatically identifies whether the token belongs to a User or Tasker and records the KYC entry accordingly.
