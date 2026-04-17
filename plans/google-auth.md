# Plan: Google Authentication

> Source PRD: Google Auth PRD in `prds/google-auth-prd.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: Keep authentication under `/api/auth`. Add `POST /api/auth/google` for Google verification and linked sign-in. Add one completion route for brand-new Google sign-ups that finishes account creation with the same business-required fields as local registration.
- **Schema**: Keep separate `User` and `Tasker` collections. Google is an additional authentication method attached to the same account, not a separate account type. Store Google identity metadata and supported auth methods on the same records.
- **Key models**: `User` and `Tasker` remain the source of truth for account data. Existing activity logging remains the audit surface for auth events. Existing JWT token shape remains the client session contract.
- **Authentication**: The web client obtains a Google ID token and sends it to the backend. The backend verifies the token and then either links an existing account in the selected role, signs in an already-linked account, or starts a short-lived sign-up completion flow for a brand-new account. A normal TaskHub JWT is issued only after the account exists.
- **Authorization**: Existing `protectUser`, `protectTasker`, and `protectAny` middleware continue to guard protected endpoints. Google auth should not change authorization semantics for existing routes.
- **Account identity rule**: Google should behave as another login method for the same TaskHub account. Existing email/password accounts keep working unchanged. Matching Google sign-ins link to the existing account in the selected role instead of creating a duplicate.
- **Third-party boundary**: Google token verification is isolated behind one service configured by `GOOGLE_CLIENT_ID`. Email verification remains part of local auth only. Other social providers and admin auth stay out of scope.
- **Testing**: Endpoint behavior should be validated in the same API-test style already used in the repo. Google token verification should be isolated behind a mockable service boundary.

---

## Phase 1: Linked Google Sign-In For Existing Accounts

**User stories**: 3, 4, 7, 12, 15, 16, 17

### What to build

Deliver the core Google authentication path as an alternate sign-in method for already-existing TaskHub accounts. A web client can send a Google ID token with a selected role, the backend verifies the token, finds an already-linked account or links an existing email-matched account in that same role, and returns the standard JWT-based auth response that the rest of the API already understands.

### Acceptance criteria

- [ ] A returning Google-linked account can authenticate through the Google route and receive the same JWT contract used by existing auth endpoints.
- [ ] An existing local account with a matching verified Google email can be linked and then continue to work with both local login and Google login.
- [ ] Invalid token, unverified Google email, locked account, deactivated account, invalid `user_type`, and role-conflict cases return clear auth errors without creating duplicate accounts.

---

## Phase 2: New Google Sign-Up Completion Flow

**User stories**: 1, 2, 4, 5, 10, 11, 16

### What to build

Support brand-new Google sign-ups without changing the final account model. If Google verification succeeds and no account exists in the selected role, the backend should start a temporary sign-up completion flow instead of immediately creating an incomplete account. The client then submits the remaining role-specific registration fields, the backend creates a normal User or Tasker record with Google linked, and only then returns the standard JWT session.

### Acceptance criteria

- [ ] A verified Google identity with no matching existing account can start a sign-up completion flow for either `user` or `tasker`.
- [ ] Completing the required registration fields creates the same kind of TaskHub account that local sign-up creates, with Google linked as an additional auth method.
- [ ] New Google-created users and taskers can access existing protected endpoints with no authorization changes after account creation completes.

---

## Phase 3: Role-Safe Identity And Conflict Handling

**User stories**: 3, 11, 12, 15, 17

### What to build

Define how Google identity behaves across the separate User and Tasker account models. The backend should prevent silent duplication, prevent cross-role ambiguity, and make role selection explicit whenever the same email or Google identity could otherwise collide with a different account type.

### Acceptance criteria

- [ ] Google linking and sign-in only succeed within the selected role and never silently create or connect accounts across roles.
- [ ] Cross-role conflicts return an explicit error that the client can present and recover from.
- [ ] Google identity metadata is enforced consistently enough to avoid duplicate linked accounts across User and Tasker records.

---

## Phase 4: Dual-Auth Account Lifecycle

**User stories**: 3, 9, 12, 15

### What to build

Make Google auth coexist cleanly with local auth on the same account. Linked accounts should keep working with either method, Google-created accounts should be able to add a password later, and password-oriented flows should respond intentionally when an account currently only has Google linked.

### Acceptance criteria

- [ ] A linked account can use both Google auth and email/password auth without losing access or creating a second account.
- [ ] A Google-created account can add a password through an authenticated flow and then sign in with local credentials.
- [ ] Password reset, password change, and password-gated account actions return clear behavior for accounts that do not yet have a local password.

---

## Phase 5: Hardening, Observability, And Rollout Slice

**User stories**: 14, 15, 16, 17

### What to build

Prepare Google auth for production rollout by adding audit visibility, regression coverage, and operational setup. This slice makes the feature supportable, testable, and safe to release without changing the public behavior established in earlier phases.

### Acceptance criteria

- [ ] Google auth success, failure, link, and new-account-creation events are captured through the existing activity logging approach.
- [ ] Automated coverage exists for Google token verification and endpoint-level success and error cases across both roles.
- [ ] Environment setup and release notes cover Google client ID configuration, client/backend contract expectations, and any selected abuse protections for launch.