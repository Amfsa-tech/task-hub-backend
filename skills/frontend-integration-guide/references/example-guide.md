# Example: Wallet Funding — Frontend Integration Guide

This is a complete example of a frontend integration guide produced using the template. Use this as a reference for the expected quality, depth, and style.

---

# Wallet Funding — Frontend Integration Guide

> Audience: Frontend developers and AI agents integrating wallet funding into the client application.
> Base URL: `{{API_BASE_URL}}` (e.g., `https://api.ngtaskhub.com`)

---

## 1. Overview

The wallet funding feature allows users to add money to their TaskHub wallet using Paystack. The client initializes a payment, redirects the user to Paystack's checkout page, and then verifies the payment on return. Upon successful verification, the wallet balance updates automatically.

## 2. Prerequisites

- A valid **User JWT token** (tasker tokens are rejected)
- Paystack redirect URL configured in the backend (handled server-side, no client config needed)
- The user must have an active account (email verified)

## 3. Architecture in One Paragraph

The client sends the funding amount to the backend, which creates a Paystack checkout session and returns a redirect URL. The client opens that URL (in-app browser or system browser). After the user completes payment, Paystack redirects back to the app with a reference. The client calls the verify endpoint with that reference; the backend confirms the payment with Paystack and credits the wallet.

## 4. Full Flow Diagram

```
[User taps "Fund Wallet"]
        |
        v
POST /api/wallet/fund/initialize { amount: 5000 }
        |
   +----+----+
   |         |
 200 OK    4xx Error
   |         |
   v      Show error
Open authorizationUrl
in browser
   |
   v
[User completes Paystack payment]
   |
   v
Paystack redirects to callback URL
with ?reference=WF-userId-xxx
   |
   v
GET /api/wallet/fund/verify?reference=WF-userId-xxx
        |
   +----+----+
   |         |
 200 OK    400 Error
   |         |
   v      Show "payment
Show success,    failed" message
update balance
```

## 5. Endpoints

### 5.1 Initialize Payment

**`POST /api/wallet/fund/initialize`**

Auth: `Bearer <user_token>`

#### Request

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Amount in Naira. Minimum: 100 |

**Request Body Example:**
```json
{
  "amount": 5000
}
```

#### Response

**Success (200):**
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

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Amount below minimum | `{ "status": "error", "message": "Minimum funding amount is 100" }` |
| 401 | Not authenticated | `{ "status": "error", "message": "Not authorized" }` |
| 403 | Tasker token used | `{ "status": "error", "message": "Only users can fund wallet" }` |

#### Frontend Implementation

**JavaScript (fetch):**
```js
const response = await fetch(`${BASE_URL}/api/wallet/fund/initialize`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ amount: 5000 })
});

const data = await response.json();

if (data.status === 'success') {
  // Open Paystack checkout in browser
  window.open(data.data.authorizationUrl, '_blank');
  // Store reference for verification after redirect
  localStorage.setItem('pendingFundingRef', data.data.reference);
} else {
  showToast(data.message, 'error');
}
```

**React Native:**
```js
const response = await fetch(`${BASE_URL}/api/wallet/fund/initialize`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ amount: 5000 })
});

const data = await response.json();

if (data.status === 'success') {
  // Open in in-app browser
  Linking.openURL(data.data.authorizationUrl);
  AsyncStorage.setItem('pendingFundingRef', data.data.reference);
}
```

### 5.2 Verify Payment

**`GET /api/wallet/fund/verify?reference=<reference>`**

Auth: `Bearer <user_token>`

#### Request

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reference` | string | Yes | The reference returned by the initialize endpoint (e.g., `WF-userId-1234567890-a1b2c3d4`) |

#### Response

**Success (200):**
```json
{
  "status": "success",
  "message": "Payment verified and wallet credited",
  "data": {
    "walletBalance": 15000,
    "amountFunded": 5000,
    "reference": "WF-userId-1234567890-a1b2c3d4"
  }
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Invalid reference | `{ "status": "error", "message": "Invalid payment reference" }` |
| 400 | Payment not completed | `{ "status": "error", "message": "Payment not yet completed" }` |
| 401 | Not authenticated | `{ "status": "error", "message": "Not authorized" }` |

#### Frontend Implementation

**JavaScript:**
```js
// Called when the app detects the redirect back from Paystack
const urlParams = new URLSearchParams(window.location.search);
const reference = urlParams.get('reference') || localStorage.getItem('pendingFundingRef');

if (reference) {
  const response = await fetch(`${BASE_URL}/api/wallet/fund/verify?reference=${reference}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();

  if (data.status === 'success') {
    updateWalletBalance(data.data.walletBalance);
    showToast('Wallet funded successfully!', 'success');
    localStorage.removeItem('pendingFundingRef');
  } else {
    showToast(data.message, 'error');
  }
}
```

## 6. State Management

- **Wallet balance**: Store in global state (Redux, Context, or Zustand). Update after successful verification.
- **Pending reference**: Store in `localStorage` (web) or `AsyncStorage` (React Native) so the app can verify payment even if the user closes the browser and returns later.
- **Refetch on mount**: Always call `GET /api/wallet/balance` when the wallet screen mounts to ensure the displayed balance is current.

## 7. Error Handling Guide

| Error | HTTP Status | Frontend Action |
|-------|-------------|-----------------|
| `"Minimum funding amount is 100"` | 400 | Disable "Fund" button when amount < 100. Show inline validation. |
| `"Only users can fund wallet"` | 403 | Hide "Fund Wallet" button for tasker accounts. |
| `"Invalid payment reference"` | 400 | Clear stored reference. Show "Payment could not be verified." |
| `"Payment not yet completed"` | 400 | Show "Payment is still processing. Please wait..." with a retry button. Poll every 5 seconds, up to 3 times. |
| Network error | N/A | Show "Unable to connect. Check your internet and try again." with retry. |

## 8. UI/UX Notes

- Show a loading spinner while the initialize call is in progress
- Disable the "Fund" button while the request is pending to prevent double-submission
- After redirecting to Paystack, show a "Verifying payment..." overlay when the user returns
- If verification fails with "Payment not yet completed", poll the verify endpoint every 5 seconds (max 3 attempts) before showing the error
- Display the wallet balance with the Naira symbol (e.g., ₦15,000)
- Format amounts with commas for readability

## 9. Common Integration Patterns

### Pattern: Wallet Screen
1. On mount, call `GET /api/wallet/balance` to get current balance
2. Display balance prominently at the top
3. "Fund Wallet" button opens an amount input modal
4. On submit, call `POST /api/wallet/fund/initialize`
5. Open the returned `authorizationUrl`
6. On redirect back, call `GET /api/wallet/fund/verify`
7. Update displayed balance with the new `walletBalance`

### Pattern: Post-Redirect Verification
1. On app load, check `localStorage`/`AsyncStorage` for `pendingFundingRef`
2. If found, automatically call verify endpoint
3. On success, clear the stored reference and update balance
4. On failure, show a notification and clear the reference

## 10. Testing Checklist

- [ ] Unauthenticated access returns 401 and redirects to login
- [ ] Amount below 100 shows inline validation before request
- [ ] Successful initialization opens Paystack checkout
- [ ] After payment, wallet balance updates correctly
- [ ] Invalid reference shows appropriate error
- [ ] "Payment not yet completed" triggers polling
- [ ] Double-tap on "Fund" button does not create duplicate payments
- [ ] Wallet screen refetches balance on mount
- [ ] Stored reference is cleared after successful verification

## 11. Changelog

| Date | Change | Breaking? |
|------|--------|-----------|
| 2025-01-15 | Initial guide | No |