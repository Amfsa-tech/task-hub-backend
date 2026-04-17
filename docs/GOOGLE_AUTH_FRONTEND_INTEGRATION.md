# Google Authentication — Frontend Integration Guide

Audience: web client developers integrating Google sign-in and sign-up with the TaskHub backend.

Base URL: `http://localhost:3009/api/auth` (development). Replace with your deployed host in production.

---

## 1. Prerequisites

1. A Google Cloud OAuth 2.0 **Web Application** client.
2. The backend must be running with `GOOGLE_CLIENT_ID` configured. The frontend must use the **same** client ID.
3. The `POST /api/auth/google` and `POST /api/auth/google/complete-signup` endpoints must be reachable from your web origin (CORS allowed).

### Google Cloud Console checklist

- Credentials → OAuth 2.0 Client ID → Web application.
- Authorized JavaScript origins: add your frontend origin (e.g. `http://localhost:3000`, `https://app.ngtaskhub.com`).
- No redirect URI is required — this integration uses the client-side ID-token flow.

---

## 2. Architecture In One Paragraph

Google is **another login method on the same TaskHub account**, not a separate account type. The client obtains a Google ID token using Google's Sign-In SDK, sends it to the backend, and the backend either signs the user in (new or already-linked) or tells the client that sign-up completion is required. After sign-up completion, the backend returns the **same JWT** contract the rest of the API already uses, so every existing protected endpoint keeps working unchanged.

---

## 3. Full Flow

```
[Google Sign-In SDK] ── idToken ──▶ POST /api/auth/google { idToken, user_type }
                                         │
               ┌─────────────────────────┼────────────────────────────┐
               ▼                         ▼                            ▼
        200 success                404 account_not_found         4xx / 5xx error
   (signed in, JWT issued)   (client shows onboarding form)   (show code-specific msg)
                                         │
                                         ▼
                    POST /api/auth/google/complete-signup
                      { idToken, user_type, ...registrationFields }
                                         │
                                         ▼
                                201 created (JWT issued)
```

---

## 4. Load Google Sign-In On The Client

### Option A: Google Identity Services (recommended)

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<div id="g_id_onload"
     data-client_id="YOUR_GOOGLE_CLIENT_ID"
     data-callback="handleGoogleCredential"
     data-auto_select="false"
     data-ux_mode="popup"></div>
<div class="g_id_signin" data-type="standard"></div>

<script>
  async function handleGoogleCredential(response) {
    // response.credential is the Google ID token (JWT)
    await signInWithGoogle(response.credential, 'user'); // or 'tasker'
  }
</script>
```

### Option B: Programmatic (React example, `@react-oauth/google`)

```tsx
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
  <YourSignInButton />
</GoogleOAuthProvider>

function YourSignInButton() {
  const login = useGoogleLogin({
    flow: 'implicit',
    onSuccess: async (tokenResponse) => {
      // For ID token, prefer `useGoogleLogin({ flow: 'auth-code' })` + backend exchange,
      // OR use <GoogleLogin /> component which yields an ID token via `credential`.
    },
  });
  return <button onClick={() => login()}>Continue with Google</button>;
}
```

> Use whichever library you already have. The backend only cares that you pass it a **valid Google ID token** whose audience is `GOOGLE_CLIENT_ID`.

---

## 5. Endpoints

### 5.1 `POST /api/auth/google` — Sign-in / link

Call this **first**, for both sign-in and sign-up attempts.

**Request**

```json
{
  "idToken": "<google-id-token>",
  "user_type": "user"  // or "tasker"
}
```

**200 — Signed in**

```json
{
  "status": "success",
  "token": "<jwt>",
  "user_type": "user",
  "isEmailVerified": true,
  "expiresIn": "24h",
  "linkedNow": false
}
```

- `linkedNow: true` means an existing email/password account was just linked to Google for the first time. You can show a "Google linked" toast.
- Store `token` the same way you store tokens from `/user-login` / `/tasker-login`. Send it as `Authorization: Bearer <token>` on all protected calls.

**404 — New user, sign-up completion required**

```json
{
  "status": "error",
  "code": "account_not_found",
  "message": "No existing account for this Google identity. Sign-up completion required.",
  "googleProfile": {
    "email": "jane@example.com",
    "name": "Jane Doe",
    "givenName": "Jane",
    "familyName": "Doe",
    "picture": "https://..."
  }
}
```

Use `googleProfile` to **prefill** the onboarding form (name/email/avatar). Keep the same `idToken` in memory — you will send it again at step 5.2.

**Other errors** — see section 6.

---

### 5.2 `POST /api/auth/google/complete-signup` — Finish sign-up

Call this only when you got `404 account_not_found` from 5.1.

Collect the same required fields your local registration form collects for the selected role, then submit:

**Request — user**

```json
{
  "idToken": "<same-google-id-token>",
  "user_type": "user",
  "fullName": "Jane Doe",
  "phoneNumber": "+2348012345678",
  "country": "Nigeria",
  "residentState": "Lagos",
  "address": "12 Admiralty Way, Lekki",
  "dateOfBirth": "1998-04-21"
}
```

**Request — tasker**

```json
{
  "idToken": "<same-google-id-token>",
  "user_type": "tasker",
  "firstName": "Jane",
  "lastName": "Doe",
  "phoneNumber": "+2348012345678",
  "country": "Nigeria",
  "originState": "Oyo",
  "residentState": "Lagos",
  "address": "12 Admiralty Way, Lekki",
  "dateOfBirth": "1998-04-21"
}
```

Notes:
- `fullName` / `firstName` / `lastName` are optional in the request — if omitted, the backend falls back to the Google profile. Send whatever the user confirms on your form.
- All other listed fields are **required**. Missing ones come back as `400 missing_fields` with a `missingFields` array.

**201 — Account created**

```json
{
  "status": "success",
  "token": "<jwt>",
  "user_type": "user",
  "isEmailVerified": true,
  "expiresIn": "24h",
  "created": true
}
```

Store `token` and proceed as if the user just logged in.

---

### 5.3 `POST /api/auth/set-password` — Optional, for Google-only users

Once a Google-signed-in user is authenticated, they can add a local password so they can also sign in with email/password afterwards.

Headers: `Authorization: Bearer <jwt>`

**Request**

```json
{ "newPassword": "at-least-6-chars" }
```

**200 — Password set**

```json
{
  "status": "success",
  "message": "Password set successfully. You can now sign in with email and password.",
  "authProviders": ["google", "local"]
}
```

**400 `password_already_set`** — already has a password, use `/change-password`.
**400 `weak_password`** — minimum 6 characters.

---

### 5.4 `POST /api/auth/deactivate-account` — Google-only variant

For accounts that have **no** local password, deactivation requires a **fresh** Google ID token instead of `password`.

Headers: `Authorization: Bearer <jwt>`

**Request (Google-only account)**

```json
{ "idToken": "<fresh-google-id-token>" }
```

- Call the Google Sign-In SDK again right before deactivation to obtain a fresh token.
- If the token's identity doesn't match the linked Google account, you get `401 google_identity_mismatch`.
- If `idToken` is missing, you get `400 google_reauth_required`.

Accounts that have a password still send `{ password }` as before.

---

## 6. Error Taxonomy

Every error response has a stable `code` field. Localize or branch on `code`, not on `message`.

| HTTP | `code` | When | What the UI should do |
|------|--------|------|------------------------|
| 400 | `invalid_request` | `idToken` missing | Retry with a valid token |
| 400 | `unsupported_role` | `user_type` not `user`/`tasker` | Fix client code |
| 400 | `missing_fields` | Completion form fields missing | Highlight `missingFields` |
| 400 | `age_restricted` | DOB < 16 years | Show age message |
| 400 | `no_password_set` | `change-password` on Google-only acct | Redirect to `/set-password` |
| 400 | `password_already_set` | `set-password` when one exists | Redirect to `/change-password` |
| 400 | `weak_password` | New password < 6 chars | Show validation |
| 400 | `google_reauth_required` | Deactivation without `idToken` | Trigger Google Sign-In, retry |
| 401 | `invalid_token` | Google token invalid/expired | Trigger Google Sign-In, retry |
| 401 | `email_not_verified` | Google reports unverified email | Tell user to verify with Google |
| 401 | `account_deactivated` | `isActive: false` | Show "contact support" |
| 401 | `account_locked` | Too many failed logins | Show "try again later" |
| 401 | `google_identity_mismatch` | Re-auth token doesn't match linked acct | Re-run Google Sign-In |
| 404 | `account_not_found` | No account for this Google identity | Start sign-up completion flow |
| 409 | `account_exists` | Completion called on already-linked identity | Redirect to sign-in |
| 409 | `account_conflict` | Identity linked in the other role | Show "this Google account belongs to a different account type" |
| 409 | `role_conflict` | Email registered in other role | Offer "sign in as {other role}" |
| 409 | `email_in_use` | Email already exists in selected role without Google | Prompt to sign in with Google (it will link) |
| 409 | `phone_in_use` | Phone taken in selected role | Ask for a different phone |
| 500 | `provider_not_configured` | Backend missing `GOOGLE_CLIENT_ID` | Show generic error, file a bug |
| 500 | `server_error` | Unexpected failure | Show generic error |

---

## 7. Reference Client Function (TypeScript)

Drop this into your auth module. It implements the full flow described above.

```ts
export type Role = 'user' | 'tasker';

type GoogleSignInSuccess = {
  status: 'success';
  token: string;
  user_type: Role;
  isEmailVerified: boolean;
  expiresIn: string;
  linkedNow?: boolean;
  created?: boolean;
};

type GoogleProfilePrefill = {
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  picture: string;
};

type NeedsSignup = {
  kind: 'needs_signup';
  idToken: string;
  role: Role;
  prefill: GoogleProfilePrefill;
};

type SignedIn = { kind: 'signed_in'; session: GoogleSignInSuccess };

type GoogleError = {
  kind: 'error';
  httpStatus: number;
  code: string;
  message: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3009/api';

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

export async function googleSignIn(
  idToken: string,
  role: Role,
): Promise<SignedIn | NeedsSignup | GoogleError> {
  const { status, data } = await postJson<any>('/auth/google', { idToken, user_type: role });

  if (status === 200 && data.status === 'success') {
    return { kind: 'signed_in', session: data };
  }
  if (status === 404 && data.code === 'account_not_found') {
    return {
      kind: 'needs_signup',
      idToken,
      role,
      prefill: data.googleProfile,
    };
  }
  return {
    kind: 'error',
    httpStatus: status,
    code: data.code ?? 'unknown_error',
    message: data.message ?? 'Google sign-in failed',
  };
}

export async function googleCompleteSignup(
  idToken: string,
  role: Role,
  fields: Record<string, unknown>,
): Promise<SignedIn | GoogleError> {
  const { status, data } = await postJson<any>('/auth/google/complete-signup', {
    idToken,
    user_type: role,
    ...fields,
  });

  if (status === 201 && data.status === 'success') {
    return { kind: 'signed_in', session: data };
  }
  return {
    kind: 'error',
    httpStatus: status,
    code: data.code ?? 'unknown_error',
    message: data.message ?? 'Sign-up failed',
  };
}

export async function setPassword(jwt: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/set-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ newPassword }),
  });
  return { status: res.status, data: await res.json() };
}
```

### Wiring the Google button to the flow

```ts
async function onGoogleCredential(response: { credential: string }, role: Role) {
  const result = await googleSignIn(response.credential, role);

  switch (result.kind) {
    case 'signed_in':
      saveSession(result.session.token, result.session.user_type);
      navigate('/dashboard');
      return;

    case 'needs_signup':
      // Keep idToken + prefill in memory/state and navigate to the onboarding form
      openOnboardingForm({ idToken: result.idToken, role: result.role, prefill: result.prefill });
      return;

    case 'error':
      handleAuthError(result); // map result.code -> UI copy using section 6
      return;
  }
}

async function onOnboardingSubmit(
  idToken: string,
  role: Role,
  formValues: Record<string, unknown>,
) {
  const result = await googleCompleteSignup(idToken, role, formValues);
  if (result.kind === 'signed_in') {
    saveSession(result.session.token, result.session.user_type);
    navigate('/dashboard');
  } else {
    handleAuthError(result);
  }
}
```

---

## 8. UX Recommendations

- Use **one** "Continue with Google" button for both sign-in and sign-up. The backend decides which flow to run.
- For role selection, ask "are you signing in as a **User** or a **Tasker**?" **before** triggering the Google button, or include a toggle on the sign-in screen. The `user_type` must be sent with every Google call.
- On the onboarding form (after `needs_signup`), prefill from `prefill` and **lock the email field** (the backend uses the Google email; editing it has no effect).
- Show "Already have an account? Sign in" whenever you receive `email_in_use`, `account_exists`, or `account_conflict` — these all mean "don't create, use the existing account".
- When `role_conflict` is returned, offer a one-click switch to the opposite role's sign-in.
- Keep the same `idToken` in memory from the initial sign-in call until completion submits. Do **not** persist it. If the user takes too long and it expires, re-trigger Google Sign-In.

---

## 9. Interaction With Existing Endpoints

- Once you have the JWT from any of the Google endpoints, all existing protected routes (`GET /api/auth/user`, `GET /api/auth/tasker`, `PUT /api/auth/profile`, task/bid/wallet/etc.) work unchanged.
- Email/password endpoints (`/user-login`, `/tasker-login`, `/forgot-password`, `/reset-password`, `/change-password`) continue to work for local accounts and for accounts that have both providers linked.
- For Google-only accounts, `change-password` returns `400 no_password_set`; route the user to `/set-password` instead.
- `forgot-password` + `reset-password` also works for Google-only accounts — completing a reset sets their **first** local password and the account becomes dual-auth.

---

## 10. Quick Test Checklist

- [ ] Sign in as a brand-new Google account → expect `404 account_not_found` → submit completion → expect `201 created`.
- [ ] Sign in again with the same Google account → expect `200` with `linkedNow: false`.
- [ ] Register locally with an email, then sign in with Google using the same email → expect `200` with `linkedNow: true`. Local login should still work afterwards.
- [ ] Try Google sign-in as the opposite role for an already-linked identity → expect `409 account_conflict`.
- [ ] Google-only account calls `/change-password` → expect `400 no_password_set`. Then `/set-password` → expect `200`. Then `/change-password` works.
- [ ] Google-only account calls `/deactivate-account` without `idToken` → expect `400 google_reauth_required`. With fresh token → expect `200`.

---

## 11. Environment Variables (Frontend)

```
VITE_GOOGLE_CLIENT_ID=<same as backend GOOGLE_CLIENT_ID>
VITE_API_BASE=https://your-api-host/api
```

Both values must be set at build time. Do **not** hardcode them in source.
