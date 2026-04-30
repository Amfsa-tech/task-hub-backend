# Plan: Task Rating & Review System

> Source PRD: Conversation-based analysis of existing codebase (April 2026)

## Architectural decisions

Durable decisions that apply across all phases:

- **Route base**: `POST /api/tasks/:id/rate` — user-protected, only task owner can rate
- **Route base**: `GET /api/taskers/:id/reviews` — public, no authentication required
- **Schema**: No new collection. Rating data lives on the existing `Task` model.
  - `rating: { type: Number, min: 1, max: 5 }`
  - `reviewText: { type: String }` (max 500 chars, validated in controller)
  - `ratedAt: { type: Date }` — set when rating is first submitted
  - `isReviewHidden: { type: Boolean, default: false }` — soft-hide for admin moderation
- **Key models**: `Task`, `Tasker`
- **Authentication**: `protectUser` middleware for rating submission; task ownership verified in controller
- **Authorization rules**:
  - Only the `user` who created the task can rate it
  - Rating is only allowed when `task.status === 'completed'` (strict — no exceptions)
  - A task can only be rated once. Re-rating is NOT allowed (no edit/delete).
  - Rating is blocked if the task has no `assignedTasker`
  - Rating is blocked if the assigned tasker is deleted or deactivated
  - Rating is mandatory if `reviewText` is provided. Rating-only (no text) is valid.
- **Average rating calculation**: Derived from all completed tasks assigned to the tasker that have `rating: { $exists: true }` AND `isReviewHidden: false`. Computed on-demand in the controller and persisted to `Tasker.averageRating`.
- **Response shapes**:
  - Rating submission: `{ status: 'success', data: { task, averageRating } }`
  - Reviews list: `{ status: 'success', data: { reviews: [...], total, page, pages } }`
- **Reused utilities**: Existing `protectUser` middleware, `Task` and `Tasker` models, notification utils

---

## Phase 1: Submit Rating & Recalculate Average

**User stories**:
- As a user, I want to rate a tasker after my task is completed so I can share my experience.
- As a tasker, I want my average rating to update automatically when I receive a new review.

### What to build

A complete vertical slice: a user-protected `POST /api/tasks/:id/rate` endpoint that accepts a `rating` (1–5) and optional `reviewText`, validates that the authenticated user owns the task and the task is completed, writes the rating to the Task document, recalculates the tasker's `averageRating` from all their completed and rated tasks, persists the new average to the Tasker document, and returns the updated task along with the tasker's new average rating.

### Acceptance criteria

- [ ] `POST /api/tasks/:id/rate` returns 200 when a valid rating is submitted by the task owner for a completed task
- [ ] Returns 403 if the authenticated user is not the task owner
- [ ] Returns 400 if the task status is not `'completed'`
- [ ] Returns 400 if `rating` is missing or outside the range 1–5
- [ ] Returns 400 if the task has no `assignedTasker`
- [ ] Returns 400 if the assigned tasker is deleted or deactivated
- [ ] Returns 409 if the task has already been rated (no re-rating allowed)
- [ ] Returns 400 if `reviewText` is provided but `rating` is missing
- [ ] Returns 400 if `reviewText` exceeds 500 characters
- [ ] Task document is updated with `rating`, `reviewText`, and `ratedAt`
- [ ] Tasker's `averageRating` is recalculated and persisted
- [ ] Response includes the updated task and the tasker's new `averageRating`
- [ ] Sentry captures any unexpected errors

---

## Phase 2: Tasker Reviews Endpoint

**User stories**:
- As a user, I want to see all reviews for a tasker before hiring them.
- As a tasker, I want to see my review history.

### What to build

A public `GET /api/taskers/:id/reviews` endpoint that returns all completed tasks assigned to the tasker that have a rating and are not hidden, populated with the reviewer's name and profile picture, sorted by most recent, with pagination support.

### Acceptance criteria

- [ ] `GET /api/taskers/:id/reviews` returns 200 with a paginated list of reviews
- [ ] Each review includes: reviewer name, reviewer profile picture, rating, review text, date, and minimal task info (taskId, taskTitle, taskCategory)
- [ ] Only tasks with `status: 'completed'`, `rating: { $exists: true }`, and `isReviewHidden: false` are returned
- [ ] Results are sorted by `ratedAt` descending (most recent first)
- [ ] Supports `page` and `limit` query parameters (defaults: page=1, limit=10)
- [ ] Returns `total`, `page`, `pages`, and `reviews` in the response
- [ ] Returns 404 if the tasker does not exist

---

## Phase 3: Rating Notification

**User stories**:
- As a tasker, I want to receive a notification when a user leaves me a rating so I know how I'm performing.

### What to build

A notification utility function `notifyTaskerAboutNewRating` that sends a push notification to the tasker when their task receives a new rating. Integrate this into the rating submission controller from Phase 1 so the tasker is notified immediately after a rating is submitted.

### Acceptance criteria

- [ ] New utility function `notifyTaskerAboutNewRating(taskerId, rating, reviewText)` exists in `utils/notificationUtils.js`
- [ ] Function sends a push notification via the existing OneSignal/web-push infrastructure
- [ ] Notification payload includes the rating value and a preview of the review text
- [ ] Rating submission controller calls this utility after successful save
- [ ] Notification failures are caught and logged but do not fail the rating submission
- [ ] Sentry captures notification errors

---

## Phase 4: Admin Rating Moderation

**User stories**:
- As an admin, I want to view all ratings in the system to monitor quality.
- As an admin, I want to hide inappropriate reviews.

### What to build

Admin endpoints for viewing and moderating ratings. `GET /api/admin/reviews` returns a paginated list of all rated tasks with reviewer and tasker info. `PATCH /api/admin/reviews/:taskId/hide` allows an admin to hide a review by setting `isReviewHidden: true` on the Task document. Recalculate the tasker's average rating after moderation. Admins can also unhide a review (`PATCH /api/admin/reviews/:taskId/unhide`).

### Acceptance criteria

- [ ] `GET /api/admin/reviews` returns paginated list of all tasks with ratings
- [ ] Supports filtering by rating value, date range, and search by reviewer/tasker name
- [ ] `PATCH /api/admin/reviews/:taskId/hide` sets `isReviewHidden: true`
- [ ] `PATCH /api/admin/reviews/:taskId/unhide` sets `isReviewHidden: false`
- [ ] Tasker's `averageRating` is recalculated after a review is hidden or unhidden
- [ ] Only admins can access these endpoints (protected by `adminMiddleware`)
- [ ] Response shapes match existing admin API conventions

---

## Decisions Log

| # | Question | Decision |
|---|----------|----------|
| 1 | Ratings on `Task` vs new `Review` collection | Keep on `Task` — no new collection |
| 2 | Moderation: soft-hide vs hard-delete | Soft-hide via `isReviewHidden: Boolean` on Task |
| 3 | Add `ratedAt` timestamp? | Yes — set when rating is first submitted |
| 4 | Rating eligibility | Strict `status === 'completed'` only |
| 5 | Can users edit/delete their rating? | No — one-time submission, no edits or deletes |
| 6 | Bidirectional ratings (tasker rates user)? | Deferred to V2 |
| 7 | Average rating calculation | Write-time aggregation, cache on `Tasker.averageRating` |
| 8 | Hidden review impact on average | Exclude hidden reviews from aggregation |
| 9 | Reviews endpoint auth | Public — no authentication required |
| 10 | Review payload content | Minimal task info included (taskId, taskTitle, taskCategory) |
| 11 | Pagination defaults | `page=1`, `limit=10` |
| 12 | Notification timing | Immediate push notification to tasker |
| 13 | Notification failure handling | Silent fail — rating succeeds regardless |
| 14 | Rating with no assigned tasker | Block with 400 error |
| 15 | Rating when tasker is deleted/deactivated | Block with 400 error |
| 16 | Concurrent rating race condition | Simple read-then-write for now |
| 17 | Admin moderation powers | Hide/show only — no editing user content |
| 18 | Review text length constraints | No minimum, maximum 500 characters |
| 19 | Rating mandatory when text is provided? | Yes — rating is mandatory if text is provided. Rating-only (no text) is valid. |
| 20 | Tasker replies to reviews? | Deferred to future phase |
