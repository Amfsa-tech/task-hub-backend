## Problem Statement

Users currently must register and sign in to TaskHub using an email/password combination. This introduces friction — users need to create yet another password, verify their email manually, and remember credentials. This leads to drop-off during registration and slower onboarding. Users expect the standard "Sign in with Google" option that most modern platforms provide for seamless, one-tap authentication.

## Solution

Add Google authentication (sign-in and sign-up) to the TaskHub backend API. The client will use Google's Sign-In SDK to obtain a Google ID token, then send it to a new backend endpoint. The backend verifies the token with Google, and either signs in an existing user or creates a new account. Google-authenticated users skip email verification (Google already verified the email) and can complete their profile (phone, address, DOB, etc.) in a separate onboarding step after sign-up.

## User Stories

1. As a new user, I want to sign up with my Google account, so that I can start using TaskHub without filling out a long registration form or creating a password.
2. As a new tasker, I want to sign up with my Google account, so that I can quickly onboard as a service provider.
3. As an existing user with an email/password account, I want to sign in with Google using the same email, so that my accounts are linked and I can use either method to log in.
4. As a Google-authenticated user, I want my email to be automatically verified, so that I don't have to go through the email verification step.
5. As a new Google user, I want my Google profile picture to be used as my default profile picture, so that my account has a photo without me uploading one.
6. As a new Google user, I want to be prompted to complete my profile (phone number, address, date of birth, etc.) after sign-up, so that I can finish registration at my own pace.
7. As a returning Google user, I want to sign in with one tap, so that I can access my account quickly without remembering a password.
8. As a Google user who hasn't completed their profile, I want the API to tell me my profile is incomplete, so that the client can redirect me to the onboarding form.
9. As a user who signed up with Google, I want to optionally set a password later, so that I have a fallback sign-in method.
10. As a Google user, I want my full name parsed from my Google profile, so that I don't have to re-enter it.
11. As a tasker signing up with Google, I want to specify that I'm a tasker (not a regular user), so that my account is created with the correct role.
12. As an existing user with a Google-linked account, I want to continue using email/password login if I prefer, so that linking Google doesn't lock me out of my previous login method.
13. As a developer, I want a clear `isProfileComplete` flag in auth responses, so that the client knows whether to show the onboarding flow.
14. As an admin, I want to see which auth provider a user registered with (local vs. Google), so that I can understand my user base and troubleshoot auth issues.
15. As a user, I want failed Google auth attempts to return clear error messages, so that I understand what went wrong (e.g., invalid token, expired token, account locked).
16. As a client developer, I want the Google auth endpoint to return the same JWT token format as email/password login, so that all existing protected endpoints work without changes.
17. As a security-conscious user, I want Google auth to be protected against token replay attacks, so that my account is secure.

## Implementation Decisions

### New Endpoint

- `POST /api/auth/google` — accepts `{ idToken, user_type }` where `user_type` is `"user"` or `"tasker"`
- Returns same response shape as existing login endpoints: `{ token, user_type, isEmailVerified, isProfileComplete, expiresIn }`

### Google Token Verification

- Use the `google-auth-library` npm package (official Google library)
- Verify the ID token against the configured `GOOGLE_CLIENT_ID`
- Extract `sub` (Google user ID), `email`, `name`, `picture`, and `email_verified` from the token payload
- Reject tokens where `email_verified` is false

### Account Creation & Linking Logic

1. **Existing account with same email found:**
   - If user has no `googleId` set yet, link the Google account by saving `googleId` and setting `authProvider` to include `'google'`
   - Generate JWT and return (standard login flow)
   - Do NOT reset or modify the existing password
   - `isProfileComplete` is `true` (they already completed registration)

2. **No existing account found (new sign-up):**
   - Create a new User or Tasker record based on `user_type`
   - Set `googleId`, `authProvider: 'google'`, `isEmailVerified: true`
   - Set `fullName` (User) or `firstName`/`lastName` (Tasker) from Google name
   - Set `profilePicture` from Google picture URL
   - Set `isProfileComplete: false`
   - Password is NOT set (field becomes optional)
   - Other required fields (phone, address, DOB, country, state) left empty — collected in onboarding
   - Generate JWT and return with `isProfileComplete: false`

### Schema Changes

**User model** — add:
- `googleId: { type: String, unique: true, sparse: true }`
- `authProvider: { type: String, enum: ['local', 'google'], default: 'local' }`
- `isProfileComplete: { type: Boolean, default: true }` (true for existing users, false for new Google sign-ups)
- Make `password` field not required (remove `required: true`, add validation only for local auth)
- Make `phoneNumber`, `country`, `residentState`, `address`, `dateOfBirth` not required at schema level (validation moves to application logic for local auth)

**Tasker model** — same changes:
- `googleId`, `authProvider`, `isProfileComplete` fields added
- `password` made optional
- `phoneNumber`, `country`, `residentState`, `originState`, `address`, `dateOfBirth` made optional at schema level

### Environment Configuration

- Add `GOOGLE_CLIENT_ID` to `config/envConfig.js` and `config.example.env`
- This is the OAuth 2.0 Client ID from Google Cloud Console

### Service Architecture

- New `services/googleAuthService.js` module with a single public method: `verifyGoogleToken(idToken)` → `{ googleId, email, name, picture, emailVerified }`
- Encapsulates all Google API interaction behind a simple interface
- Can be mocked easily for testing

### Auth Middleware Considerations

- `protectUser`, `protectTasker`, `protectAny` — no changes needed; they validate JWTs, which are generated identically regardless of auth provider
- Password-dependent flows (`change-password`, `deactivate-account`) should check if user has a password set; if not, return a clear error directing them to set one first

### Activity Logging

- Log `GOOGLE_AUTH_SUCCESS` and `GOOGLE_AUTH_FAILED` events using existing activity logger
- Log `GOOGLE_ACCOUNT_LINKED` when an existing email/password account links to Google

### Dependency Addition

- Add `google-auth-library` to `package.json`

## Testing Decisions

### What Makes a Good Test

- Tests should verify external behavior (API responses, status codes, database state) not implementation details
- Tests should not mock the database — use a test database
- Tests should cover the happy path and key error paths
- Google token verification should be mocked (external dependency)

### Modules to Test

1. **Google Auth Service** (`services/googleAuthService.js`)
   - Mock the Google OAuth2Client
   - Test: valid token returns user payload
   - Test: invalid/expired token throws appropriate error
   - Test: token with `email_verified: false` is rejected

2. **Google Auth Endpoint** (`POST /api/auth/google`)
   - Test: new user sign-up returns JWT, `isProfileComplete: false`, `isEmailVerified: true`
   - Test: new tasker sign-up creates Tasker record, not User
   - Test: existing email/password user links Google account, `isProfileComplete: true`
   - Test: returning Google user signs in successfully
   - Test: locked account returns 401
   - Test: deactivated account returns 401
   - Test: invalid `user_type` returns 400
   - Test: missing `idToken` returns 400
   - Test: invalid Google token returns 401

### Prior Art

- Existing test files: `test-endpoints.js`, `test-nin-service.js`, `test-media-upload.js`
- Follow the same pattern used in these files for HTTP endpoint testing

## Out of Scope

- Other social login providers (Apple, Facebook, GitHub) — Google only for now
- Frontend implementation (Google Sign-In button, SDK integration) — backend API only
- Two-factor authentication (2FA)
- Refresh token mechanism
- Google One Tap on the backend side (client-side concern)
- Revoking Google access / unlinking Google from an account
- Admin Google sign-in (admin auth system is separate)
- Profile completion endpoint (already exists via `PUT /api/auth/profile`)

## Further Notes

- The existing `PUT /api/auth/profile` endpoint can serve as the onboarding completion endpoint — the client just needs to call it after Google sign-up to fill in missing fields
- The `isProfileComplete` flag should be recalculated when profile is updated (check if all required fields are filled)
- For the Google Cloud Console setup, the client will need the same `GOOGLE_CLIENT_ID` configured in their Google Sign-In SDK
- Password-related endpoints (`forgot-password`, `reset-password`) should gracefully handle Google-only users — either allow them to set a password (converting to dual-auth) or return a clear message
- Consider rate-limiting the `POST /api/auth/google` endpoint to prevent abuse
