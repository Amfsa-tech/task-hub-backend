# Plan: Category Restructure

> Source PRD: prds/category-restructure-prd.md

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes (public)**: `GET /api/main-categories`, `GET /api/universities`, `GET /api/categories` (existing, enhanced)
- **Routes (admin)**: `GET/POST/PATCH/DELETE /api/admin/main-categories`, `GET/POST/PATCH/DELETE /api/admin/universities`
- **Schema — MainCategory**: `name` (unique, lowercase), `displayName`, `description`, `icon`, `isActive`, `createdBy` (ref Admin), timestamps
- **Schema — University**: `name` (unique), `abbreviation`, `state`, `location` (text), `logo`, `isActive`, `createdBy` (ref Admin), timestamps
- **Schema — Category (enhanced)**: Add required `mainCategory` (ref MainCategory). All other fields unchanged.
- **Schema — Task (enhanced)**: Add required `mainCategory` (ref MainCategory). Add optional `university` (ref University) — required in controller when mainCategory is campus-type.
- **Schema — Tasker (enhanced)**: Add optional `university` (ref University). `categories` array unchanged.
- **Key models**: MainCategory, University, Category (enhanced), Task (enhanced), Tasker (enhanced)
- **Authentication**: Admin endpoints use existing admin auth + role guards (super_admin/operations for create/update, super_admin only for delete). Public endpoints require no auth.
- **Naming convention**: Same subcategory under different main categories uses distinct `name` values (e.g., `electrician-local` vs `electrician-campus`) but can share `displayName`.

---

## Phase 1: MainCategory Model + Admin CRUD + Public Endpoint

**User stories**: 1, 13, 16, 19

### What to build

Create the MainCategory model with the schema defined above. Build admin CRUD endpoints at `/api/admin/main-categories` with role guards matching the existing admin category pattern (super_admin/operations for create/update, super_admin only for delete). Delete has a safety check — reject if any Category documents reference the MainCategory. Add a public `GET /api/main-categories` endpoint (no auth) returning active main categories. Mount both routes in the application entry point. End-to-end: admin creates "Local Services" via POST, it appears in the public listing.

### Acceptance criteria

- [x] MainCategory model created with `name`, `displayName`, `description`, `icon`, `isActive`, `createdBy`, timestamps
- [x] `POST /api/admin/main-categories` creates a main category (super_admin/operations)
- [x] `GET /api/admin/main-categories` lists all main categories including inactive
- [x] `PATCH /api/admin/main-categories/:id` updates a main category (super_admin/operations)
- [x] `DELETE /api/admin/main-categories/:id` deletes only if no subcategories reference it (super_admin)
- [x] `GET /api/main-categories` returns only active main categories (no auth required)
- [x] Duplicate `name` values are rejected
- [x] All admin operations are audit-logged following existing pattern

---

## Phase 2: University Model + Admin CRUD + Public Endpoint

**User stories**: 15, 17, 20

### What to build

Create the University model with `name`, `abbreviation`, `state`, `location`, `logo`, `isActive`, `createdBy`, timestamps. Build admin CRUD endpoints at `/api/admin/universities` with the same role guard pattern. Delete has a safety check — reject if any Task or Tasker documents reference the university. Add a public `GET /api/universities` endpoint (no auth) returning active universities. Mount both routes. End-to-end: admin creates "University of Lagos," students can see it in the public list.

### Acceptance criteria

- [x] University model created with `name`, `abbreviation`, `state`, `location`, `logo`, `isActive`, `createdBy`, timestamps
- [x] `POST /api/admin/universities` creates a university (super_admin/operations)
- [x] `GET /api/admin/universities` lists all universities including inactive
- [x] `PATCH /api/admin/universities/:id` updates a university (super_admin/operations)
- [x] `DELETE /api/admin/universities/:id` deletes only if no tasks or taskers reference it (super_admin)
- [x] `GET /api/universities` returns only active universities (no auth required)
- [x] Duplicate `name` values are rejected
- [x] All admin operations are audit-logged

---

## Phase 3: Category-to-MainCategory Linkage

**User stories**: 2, 14, 18

### What to build

Add a required `mainCategory` field (ref MainCategory) to the Category model. Update admin category creation to require `mainCategory` and validate it exists and is active. Update the public `GET /api/categories` endpoint to populate the `mainCategory` reference on each category, so the frontend can group subcategories by main category. The list remains flat. End-to-end: admin creates "Electrician" under "Local Services," public API returns it with the main category populated.

### Acceptance criteria

- [x] Category model has a required `mainCategory` field (ObjectId ref to MainCategory)
- [x] Admin category creation (`POST`) requires and validates `mainCategory`
- [x] Admin category creation rejects if `mainCategory` does not exist or is inactive
- [x] `GET /api/categories` populates `mainCategory` on each returned category
- [x] Existing admin category update endpoint works with the new field
- [x] Two categories with the same `displayName` can coexist if they reference different main categories (different `name` values)

---

## Phase 4: Task Posting with MainCategory + University

**User stories**: 3, 4, 5, 6, 7

### What to build

Add required `mainCategory` (ref MainCategory) and optional `university` (ref University) fields to the Task model. Update task creation validation: require `mainCategory`, validate it is active, validate all subcategories (`categories`) belong to the provided `mainCategory`, and require `university` when the main category is campus-type. Non-campus tasks skip university validation. End-to-end: user posts a campus task at "University of Lagos" with "Laundry Pickup" subcategory — validation passes. User tries to mix subcategories from different main categories — validation rejects.

### Acceptance criteria

- [x] Task model has required `mainCategory` field and optional `university` field
- [x] Task creation requires `mainCategory` and validates it exists and is active
- [x] Task creation validates all subcategories belong to the provided `mainCategory`
- [x] Task creation rejects subcategories from a different main category
- [x] Task creation requires `university` when `mainCategory` is campus-type
- [x] Task creation does not require `university` for non-campus main categories
- [x] `university` is validated to exist and be active when provided
- [x] Multiple subcategories within the same main category are accepted

---

## Phase 5: Tasker Onboarding with University

**User stories**: 8, 9, 10

### What to build

Add optional `university` field (ref University) to the Tasker model. Extend the tasker category update endpoint (`PUT /auth/categories`) to optionally accept a `university` field. Validate university exists and is active when provided. Taskers can still select subcategories across multiple main categories — no restriction. End-to-end: tasker selects "Electrician" (Local Services) and "Delivery" (Errands), sets university to "University of Lagos" — all saved.

### Acceptance criteria

- [x] Tasker model has optional `university` field (ObjectId ref to University)
- [x] `PUT /auth/categories` accepts optional `university` field
- [x] `university` validated to exist and be active when provided
- [x] Tasker can select subcategories from multiple main categories
- [x] Tasker profile (`GET /auth/tasker`) populates `university` when present

---

## Phase 6: Campus-Scoped Notifications

**User stories**: 11, 12

### What to build

Update the notification matching logic so that when a campus task is created, taskers are filtered by matching subcategory AND matching university. For non-campus tasks, matching remains subcategory-only (existing behavior). End-to-end: a campus task at "University of Lagos" for "Laundry Pickup" notifies only taskers who selected "Laundry Pickup" AND have university set to "University of Lagos."

### Acceptance criteria

- [x] Campus task notifications filter taskers by matching subcategory AND matching university
- [x] Non-campus task notifications filter taskers by matching subcategory only (unchanged)
- [x] Taskers without a university set are not notified for campus tasks
- [x] Taskers with a different university are not notified for campus tasks
- [x] Push and email notifications both respect the campus scoping

---

## Phase 7: Backward Compatibility Verification

**User stories**: 21, 22

### What to build

Verify that existing tasks, taskers, and categories in the database continue to function correctly. The nearby taskers endpoint still populates `primaryCategory` from the first subcategory. Existing API consumers receive the same response shapes with the new fields added non-destructively. No new code — this is a validation pass across all modified endpoints.

### Acceptance criteria

- [x] Existing tasks without `mainCategory` or `university` are still queryable
- [x] Existing taskers without `university` are still queryable
- [x] `GET /api/taskers/nearby` still populates `primaryCategory` correctly
- [x] `GET /api/tasks` and `GET /api/tasks/:id` still return expected shapes
- [x] Tasker feed (`GET /api/tasks/tasker/feed`) still works with enhanced task model
