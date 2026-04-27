# Plan: Sentry Integration

> Source PRD: User request — integrate Sentry Node SDK into TaskHub Express server for error tracking and monitoring.

## Architectural decisions

Durable decisions that apply across all phases:

- **Module system**: ESM (`"type": "module"` in `package.json`) — all Sentry imports use `import * as Sentry from "@sentry/node"`.
- **Entry point**: `index.js` is the application lifecycle root; Sentry must be initialized before any other imports via `instrument.js`.
- **Route prefix**: `/debug-sentry` is reserved for the intentional error verification endpoint.
- **Error handler placement**: `Sentry.setupExpressErrorHandler(app)` must be registered after all controllers and before any other error middleware.
- **Environment config**: Sentry DSN is read from `envConfig.js` (`SENTRY_DSN`); `sendDefaultPii` is disabled to avoid leaking sensitive data.
- **User context**: The auth middleware attaches `userId` and `userType` to Sentry events via `Sentry.setUser()`.
- **Debug endpoint**: `/debug-sentry` is environment-gated and only available when `NODE_ENV !== 'production'`.

---

## Phase 1: SDK Installation & Initialization

**User stories**:
- As a developer, I want Sentry to capture unhandled errors so I can monitor production issues.
- As a developer, I want Sentry initialized before the app starts so no errors are missed during boot.

### What to build

Install the Sentry Node SDK and create an `instrument.js` module that initializes Sentry with the DSN loaded from `envConfig.js` and `sendDefaultPii: false`. Import `instrument.js` at the very top of `index.js` before any other application imports. Ensure the ESM import syntax is used throughout.

### Acceptance criteria

- [ ] `@sentry/node` is added to `package.json` dependencies.
- [ ] `SENTRY_DSN` is exported from `envConfig.js`.
- [ ] `instrument.js` exists and calls `Sentry.init({ dsn: SENTRY_DSN, sendDefaultPii: false })`.
- [ ] `index.js` imports `./instrument.js` as its first import.
- [ ] The server starts successfully without errors after the change.

---

## Phase 2: Express Error Handler, Debug Endpoint & User Context

**User stories**:
- As a developer, I want Express errors forwarded to Sentry so HTTP 500s are tracked.
- As a developer, I want a quick way to verify that Sentry is receiving events.
- As a developer, I want to see which user experienced an error so I can reproduce and fix it faster.

### What to build

Import the Sentry SDK in `index.js`, register `Sentry.setupExpressErrorHandler(app)` after all route declarations but before the existing fallthrough error middleware. Update the existing error middleware to include `sentryEventId: res.sentry || null` in its JSON response. Add a `GET /debug-sentry` route that throws an intentional error, gated so it only registers when `NODE_ENV !== 'production'`. In `authMiddleware.js`, call `Sentry.setUser({ id: req.user._id, userType: req.user.userType })` after successful token verification (and clear it on logout/unauthenticated requests).

### Acceptance criteria

- [ ] `Sentry.setupExpressErrorHandler(app)` is placed after all `app.use(...)` route declarations and before the existing `app.use((err, req, res, next) => ...)` middleware.
- [ ] The existing error middleware returns `sentryEventId: res.sentry || null` in its JSON response.
- [ ] `GET /debug-sentry` throws `new Error("My first Sentry error!")` and is only registered when `NODE_ENV !== 'production'`.
- [ ] Hitting `/debug-sentry` results in an HTTP 500 and the error is captured by Sentry.
- [ ] `authMiddleware.js` sets `Sentry.setUser({ id, userType })` after verifying the JWT.
- [ ] Other existing routes continue to return their normal responses and any errors on them are also captured by Sentry.

---
