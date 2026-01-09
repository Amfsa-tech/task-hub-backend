# TaskHub — Product Overview (PM)

**Last updated:** 2026-01-06  
**Audience:** Product Management (overview + shared vocabulary)  
**Sources:** Backend docs under `taskhub_server/docs/` and server routes/controllers.

---

## 1) Executive Summary
TaskHub is a two-sided marketplace that connects **Users** (people who need work done) with **Taskers** (service providers). Users post tasks with budgets and categories; taskers discover relevant tasks, apply (either with a custom bid or as a fixed-price application), and communicate with users via in-app chat. The platform includes admin-managed service categories, push notifications (OneSignal), and tasker identity verification (NIN via QoreID).

---

## 2) Personas & Roles

### A) User (Demand-side)
- Goal: Get a task completed quickly, safely, and within budget.
- Typical actions: Register/login, create tasks, review bids/applications, accept a tasker, chat, track status.

### B) Tasker (Supply-side)
- Goal: Find relevant jobs and win work.
- Typical actions: Register/login, select categories, browse task feed, place bids/apply, chat, manage engagements.
- Optional trust feature: NIN identity verification.

### C) Admin (Platform)
- Goal: Maintain a high-quality marketplace taxonomy (categories) and ensure consistency.
- Typical actions: Create/update/deactivate categories, view category usage stats.

---

## 3) Core Value Proposition

### For Users
- Faster matching via **multiple categories per task** (e.g., “bathroom renovation” can match plumbing + electrical + handyman).
- Choice of tasker via **bidding** (custom quotes) or **fixed budget applications**.
- Real-time-ish engagement through **chat** and **push notifications**.

### For Taskers
- More opportunities through category-based discovery.
- Clear application modes per task (“Place Bid” vs “Apply for Task” at fixed price).
- Notifications for tasks matching their categories.

### For the Platform
- Admin-controlled category system improves consistency and matching quality.
- Identity verification builds trust signals for taskers.

---

## 4) Current Feature Set (What Exists)

### Authentication & Account Safety
- Separate registration/login flows for users and taskers.
- Email verification (5-digit codes), resend verification.
- Password reset (5-digit code), reset password.
- JWT auth + authorization headers.
- Account lockout protection after repeated failures (documented).

### Categories (Admin-Managed)
- Categories are **ObjectId-based** entities with `name`, `displayName`, `description`, `isActive`, and creator metadata.
- Public category browsing for app dropdowns.
- Admin endpoints: create, update, list all (incl. inactive), deactivate (safe), and usage statistics.

### Tasks
- Users can create tasks with:
  - title/description
  - **categories[]** (one or more)
  - location (lat/lng)
  - budget
  - optional tags/images, deadline
  - `isBiddingEnabled` (controls application mode)
- Tasks can be filtered/retrieved; task detail responses include populated category objects.

### Unified Bidding / Applications
- Single “bid/application” system supports both task modes:
  - **Bidding enabled:** tasker sets `amount` (custom bid)
  - **Bidding disabled:** tasker applies; system uses task `budget` (fixed)
- Bid records include `bidType: custom | fixed` to distinguish mode.
- Users can view bids for their task and accept/reject.

### Chat
- Users and taskers can chat inside a **Conversation** linked to a task.
- Guardrail: a conversation is only allowed if the tasker has applied for the task.
- Endpoints:
  - Create/get conversation for task + counterparty
  - List conversations
  - Get conversation
  - List messages
  - Send message (text and/or attachments)
  - Mark conversation read (unread counters)

### Push Notifications (OneSignal)
- Users/taskers register their OneSignal subscription id (`notificationId`).
- Notifications supported/documented:
  - New matching task alerts to taskers
  - New bid notifications to users
  - Bid accepted/rejected notifications to taskers
  - Task completion / cancellation notifications
  - Welcome notifications
  - New chat message notification (implemented in chat controller via notification utils)

### Identity Verification (Taskers)
- NIN verification via QoreID.
- One-time verification; does not store raw NIN (privacy).
- Endpoint to verify identity and endpoint to check verification status.

---

## 5) Primary User Journeys (End-to-End)

### Journey 1 — User posts a task and hires a tasker
1. User registers → verifies email → logs in.
2. User fetches categories and selects 1–5 categories.
3. User creates a task with location + budget and sets whether bidding is enabled.
4. Matching taskers receive push notifications (category overlap).
5. Taskers bid/apply.
6. User reviews bids/applications and accepts one.
7. User and tasker chat to coordinate.
8. Task proceeds through statuses (open → assigned/in-progress → completed/cancelled).

### Journey 2 — Tasker finds work
1. Tasker registers → verifies email → logs in.
2. Tasker selects categories (ObjectIds).
3. Tasker views task feed, sees whether task is bidding vs fixed.
4. Tasker bids with amount (bidding) OR applies (fixed).
5. Tasker receives acceptance/rejection and chats with the user.

### Journey 3 — Trust & safety for taskers
1. Tasker submits NIN + personal details.
2. QoreID verifies match and sets `verifyIdentity = true`.
3. Tasker’s verification status can be queried later.

---

## 6) Product Surface Area (Objects & Concepts)

- **User**: customer profile; includes wallet + notification id.
- **Tasker**: provider profile; includes categories[], wallet, notification id, and `verifyIdentity`.
- **Category**: admin-curated taxonomy; active/inactive; usage stats.
- **Task**: posted work; has categories[], budget, location, status, optional bidding.
- **Bid/Application**: tasker’s request to do the task; includes amount + bidType.
- **Conversation**: user-tasker chat thread for a given task; unread counters per side.
- **Message**: chat messages + attachments; read status tracking.

---

## 7) System / Architecture At-a-Glance (Implementation-Aware)

- **Client:** Flutter app (TaskHub mobile).
- **Backend:** Node.js + Express (ES modules), REST API.
- **Database:** MongoDB via Mongoose models.
- **Notifications:** OneSignal (push).
- **Email:** Nodemailer (SendGrid integration appears present).
- **Identity verification:** QoreID integration.

---

## 8) Key KPIs (Suggested, PM-ready)

Marketplace health:
- New tasks created per day/week
- Tasks with ≥1 bid/application within 24h
- Median time-to-first-bid
- Bid-to-accept conversion rate
- Task completion rate
- Cancellation rate

Supply health:
- Active taskers by category
- Tasker response rate (bids per tasks viewed)
- Verification adoption rate (taskers verified)

Engagement:
- Conversations created per accepted task
- Messages per conversation
- Push opt-in coverage (% with notificationId)

---

## 9) Dependencies & Operational Notes

- OneSignal credentials must be configured for push notifications.
- QoreID credentials/config must be configured for NIN verification.
- Category quality is critical (admin workflows are a core dependency for matching).

---

## 10) Known Product/Spec Gaps (Worth Clarifying)
These are areas that appear in models/docs but are not fully described at a product-spec level in the current docs set:
- Payments: “wallet” exists, but end-to-end payment flows/escrow/refunds are not described here.
- Reviews/ratings: not documented in the current server docs.
- Dispute handling: not documented.
- Location filtering and ranking: there’s a fix doc in the repo; the full matching strategy is not fully specified at a PM level.

---

## 11) Glossary
- **Bidding-enabled task**: tasker can propose a custom price (`bidType=custom`).
- **Fixed-price task**: tasker applies; price is the task’s budget (`bidType=fixed`).
- **Category overlap**: taskers match tasks if they have ANY category in the task’s `categories[]`.
