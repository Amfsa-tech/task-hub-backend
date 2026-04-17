# Google Auth Feature Changelog

Tracking all changes made while implementing the Google authentication feature.
Source plan: [plans/google-auth.md](../plans/google-auth.md).

---

## Phase 1: Linked Google Sign-In For Existing Accounts

### Added

- **Dependency**: `google-auth-library` added via `npm install google-auth-library`.
- **Env var**: `GOOGLE_CLIENT_ID` exported from [config/envConfig.js](../config/envConfig.js).
- **Service**: [services/googleAuthService.js](../services/googleAuthService.js) — encapsulates Google ID token verification behind `verifyGoogleToken(idToken)`. Throws typed errors (`invalid_token`, `email_not_verified`, `provider_not_configured`) so the controller can map them to HTTP responses. Lazily instantiates `OAuth2Client`.
- **Schema (User)**: [models/user.js](../models/user.js) — added `googleId` (unique, sparse) and `authProviders` (enum `['local', 'google']`, default `['local']`). Removed `required: true` and `unique: true` from `password` so Google-only accounts are possible (uniqueness on password was also semantically incorrect).
- **Schema (Tasker)**: [models/tasker.js](../models/tasker.js) — same additions/changes as User.
- **Controller**: `googleAuth` handler added to [controllers/auth-controller.js](../controllers/auth-controller.js). Behavior:
  1. Validates `idToken` and `user_type` (`user` | `tasker`).
  2. Verifies token via `googleAuthService`.
  3. Looks up existing linked account by `googleId` in the selected role.
  4. Cross-role guard: rejects with `account_conflict` (409) if the same `googleId` is already linked in the other role.
  5. If no linked account, looks up by email in the selected role and links Google (adds `google` to `authProviders`, sets `googleId`, marks `isEmailVerified: true`).
  6. If no account exists in selected role, returns 404 with `account_not_found` and a `googleProfile` payload the client uses to drive the Phase 2 sign-up completion flow.
  7. Parity with local login: rejects deactivated/locked accounts, resets `loginAttempts`/`lockUntil`, updates `lastLogin`, issues standard 24h JWT.
  8. Emits activity log events: `GOOGLE_AUTH_SUCCESS`, `GOOGLE_AUTH_FAILED`, `GOOGLE_ACCOUNT_LINKED`.
- **Route**: `POST /api/auth/google` wired in [routes/authRoute.js](../routes/authRoute.js).

### Response Contract (success)

```json
{
  "status": "success",
  "token": "<jwt>",
  "user_type": "user" | "tasker",
  "isEmailVerified": true,
  "expiresIn": "24h",
  "linkedNow": true | false
}
```

### Response Contract (account not found — drives Phase 2)

```json
{
  "status": "error",
  "code": "account_not_found",
  "message": "No existing account for this Google identity. Sign-up completion required.",
  "googleProfile": { "email": "...", "name": "...", "givenName": "...", "familyName": "...", "picture": "..." }
}
```

### Error Codes

| HTTP | `code` | Meaning |
|------|--------|---------|
| 400 | `invalid_request` | Missing `idToken` |
| 400 | `unsupported_role` | `user_type` not `user`/`tasker` |
| 401 | `invalid_token` | Google token invalid/expired |
| 401 | `email_not_verified` | Google says email not verified |
| 401 | `account_deactivated` | `isActive: false` |
| 401 | `account_locked` | `isLocked` true |
| 404 | `account_not_found` | No account in selected role — client should start sign-up completion |
| 409 | `account_conflict` | Same Google identity already linked in the other role |
| 500 | `provider_not_configured` | `GOOGLE_CLIENT_ID` missing on server |
| 500 | `server_error` | Unexpected failure |

### Notes / Decisions

- Local email/password auth and all existing routes are unchanged — Google is purely additive.
- Removing `unique: true` from `password` is a schema fix; callers never queried by password, and the existing unique index on the `password` field was always a bug.
- Account linking does **not** require the user to log in locally first; a verified Google email is treated as sufficient proof of ownership, matching standard web-app UX.
- Phase 1 intentionally returns 404 for unknown accounts rather than silently creating one. Phase 2 adds the completion flow.

### Not Yet Implemented (later phases)

- Phase 3: Tighter cross-role conflict handling and `googleId` uniqueness enforcement across both collections at the service layer.
- Phase 4: Set-password-for-Google-only-account flow; reset/change-password behavior for accounts without a stored password; deactivation parity for Google-only accounts.
- Phase 5: Broader audit logging, automated tests, rate limiting, release notes, `config.example.env` update.

---

## Phase 2: New Google Sign-Up Completion Flow

### Added

- **Controller**: `googleCompleteSignup` handler in [controllers/auth-controller.js](../controllers/auth-controller.js). Creates a brand-new User or Tasker with Google linked, after verifying the Google token and collecting the remaining registration fields. Behavior:
  1. Validates `idToken` and `user_type`.
  2. Verifies token via `googleAuthService`.
  3. Idempotency / conflict checks: returns 409 `account_exists` if `googleId` already linked in the selected role, 409 `account_conflict` if already linked in the other role, 409 `email_in_use` if the email is already registered in the selected role.
  4. Validates role-specific required fields. Uses Google profile as a default for names if the client doesn't override:
     - **User**: `fullName` (defaults to Google `name`), `phoneNumber`, `country`, `residentState`, `address`, `dateOfBirth`.
     - **Tasker**: `firstName` / `lastName` (default to Google `given_name` / `family_name`), `originState`, `phoneNumber`, `country`, `residentState`, `address`, `dateOfBirth`.
  5. Enforces the existing 16+ age gate and phone uniqueness inside the selected role (parity with local register).
  6. Creates the account with `isEmailVerified: true`, `authProviders: ['google']`, `googleId`, and Google `picture` as default `profilePicture`. No password is set.
  7. Issues standard 24h JWT and logs `REGISTER_SUCCESS` (via `google`) plus `GOOGLE_AUTH_SUCCESS` (`created: true`).
- **Route**: `POST /api/auth/google/complete-signup` wired in [routes/authRoute.js](../routes/authRoute.js).

### Response Contract (success, 201)

```json
{
  "status": "success",
  "token": "<jwt>",
  "user_type": "user" | "tasker",
  "isEmailVerified": true,
  "expiresIn": "24h",
  "created": true
}
```

### Error Codes (Phase 2 additions)

| HTTP | `code` | Meaning |
|------|--------|---------|
| 400 | `missing_fields` | Required role-specific fields missing (see `missingFields` array) |
| 400 | `age_restricted` | User under 16 |
| 409 | `account_exists` | Google identity already linked in selected role — client should call `POST /api/auth/google` instead |
| 409 | `account_conflict` | Google identity already linked in the other role |
| 409 | `email_in_use` | Email already registered in selected role without Google — client should call `POST /api/auth/google` to link |
| 409 | `phone_in_use` | Phone number already registered in selected role |

### Client Flow Summary

1. Client obtains Google ID token via Google Sign-In SDK.
2. Client calls `POST /api/auth/google` with `{ idToken, user_type }`.
3. If response is `200 success` → signed in, done.
4. If response is `404 account_not_found` → client shows the onboarding form prefilled with `googleProfile`, collects the rest, then calls `POST /api/auth/google/complete-signup` with `{ idToken, user_type, ...remainingFields }`.
5. On `201 created` → account created with Google linked, JWT issued, done.

### Notes / Decisions

- The same Google ID token is sent again at completion time rather than issuing a short-lived signup token. This keeps the flow simple and avoids introducing a new token type; risk is acceptable because Google ID tokens are short-lived and audience-locked. Can be revisited if abuse is observed.
- Name fields fall back to Google's `name` / `given_name` / `family_name` but can be overridden by the client, matching typical social-signup UX.
- `authProviders` is set to `['google']` only. Phase 4 will add the flow to also set a local password and append `'local'`.

### Not Yet Implemented (later phases)

- Phase 4: Set-password-for-Google-only-account flow; reset/change-password behavior for accounts without a stored password; deactivation parity for Google-only accounts.
- Phase 5: Broader audit logging, automated tests, rate limiting, release notes, `config.example.env` update.

---

## Phase 3: Role-Safe Identity And Conflict Handling

### Added

- **Shared helpers** in [controllers/auth-controller.js](../controllers/auth-controller.js) to centralize identity conflict logic across the Google auth handlers:
  - `resolveRoleModels(user_type)` — returns `{ SelectedModel, OtherModel }`.
  - `findCrossRoleGoogleConflict(OtherModel, googleId)` — detects a `googleId` already linked in the opposite role.
  - `findCrossRoleEmailConflict(OtherModel, email)` — detects an email already registered in the opposite role.
  - `mapGoogleVerifyError(err)` — maps verification errors to HTTP descriptors.
  - `sendAuthError(res, descriptor)` — standardizes the JSON error response shape.

### Changed

- `googleAuth` (Phase 1) now uses the shared helpers and additionally rejects with 409 `role_conflict` when the Google email is already registered in the opposite role, instead of letting the caller fall through to the sign-up completion path.
- `googleCompleteSignup` (Phase 2) now uses the shared helpers and performs a cross-role email check (`role_conflict`) in addition to the existing `googleId` and same-role email checks. This closes the gap where a client could otherwise try to sign up as `user` with an email that already exists as a `tasker` (or vice versa).

### Error Code Additions

| HTTP | `code` | Meaning |
|------|--------|---------|
| 409 | `role_conflict` | The Google email is already registered in the opposite role. Client should prompt the user to sign in as the other role or use a different email. |

### Invariant Enforced Across All Google Endpoints

> One verified Google identity can authenticate exactly one role-specific account, can link to an existing account in that same role by verified email, and never silently creates or links across roles.

### Notes / Decisions

- `googleId` uniqueness is enforced at the service layer by checking both collections before any create or link, not just by the per-collection sparse unique index. The combination is sufficient for this repo's two-collection model without requiring a shared identity collection.
- `account_conflict` is still emitted when the same `googleId` already belongs to an account in the opposite role; `role_conflict` is emitted when the email (not yet linked to Google in the opposite role) is taken there. Keeping the codes distinct lets the client render different messages.

### Not Yet Implemented (later phases)

- Phase 4: Set-password-for-Google-only-account flow; reset/change-password behavior for accounts without a stored password; deactivation parity for Google-only accounts.
- Phase 5: Broader audit logging, automated tests, rate limiting, release notes, `config.example.env` update.

---

## Phase 4: Dual-Auth Account Lifecycle

### Added

- **Endpoint**: `POST /api/auth/set-password` (protected, accepts `{ newPassword }`). Allows an authenticated Google-only account to set a first local password. On success:
  - Password is hashed with bcrypt (10 rounds).
  - `'local'` is appended to `authProviders` so the account becomes dual-auth.
  - `PASSWORD_SET` activity event is logged.
  - Returns 400 `password_already_set` if a password already exists (client should use `change-password`).

### Changed

- **`changePassword`** now returns `400 no_password_set` when invoked against an account without a stored password, and directs the client to use `set-password`. Existing behavior for local/dual-auth accounts is unchanged.
- **`resetPassword`** now also functions as a first-password flow: if the reset succeeds for an account that currently has no password, `'local'` is added to `authProviders`. The activity log entry includes `firstPassword: true/false`. Existing flow for local users is unchanged.
- **`deactivateAccount`** no longer assumes a stored password. Behavior is branched by account shape:
  - Accounts **with** a local password continue to require `{ password }`.
  - Accounts **without** a local password (Google-only) must instead provide `{ idToken }`. The backend verifies the token through `verifyGoogleToken` and rejects unless the resulting `googleId` matches the linked `googleId` on the account. This enforces fresh proof of possession rather than relying only on the session JWT.
  - Activity log `ACCOUNT_DEACTIVATED` now includes `{ via: 'password' | 'google' }`, and new failure reasons `invalid_google_token` / `google_identity_mismatch` are logged.

### Error Code Additions

| HTTP | `code` | Meaning |
|------|--------|---------|
| 400 | `no_password_set` | `change-password` called on an account without a password — use `set-password`. |
| 400 | `password_already_set` | `set-password` called on an account that already has a password — use `change-password`. |
| 400 | `weak_password` | `set-password` new password shorter than 6 characters. |
| 400 | `google_reauth_required` | Deactivation requested on a Google-only account without `idToken`. |
| 401 | `google_identity_mismatch` | Deactivation `idToken` verified, but its `sub` does not match the account's linked `googleId`. |

### Notes / Decisions

- `set-password` is kept intentionally separate from `change-password`. Overloading `change-password` would break its invariant that a correct current password is required, and would make the activity log ambiguous.
- For deactivation of Google-only accounts we require a **fresh Google ID token**, not just a valid session JWT. The session token alone is long-lived (24h) and deactivation is destructive.
- `forgotPassword` was intentionally not changed. It already returns a generic response regardless of account shape, so there is no enumeration risk, and Google-only users can still use the reset flow to establish a first local password.

### Not Yet Implemented (later phases)

- Phase 5: Broader audit logging, automated tests, rate limiting, release notes, `config.example.env` update.
