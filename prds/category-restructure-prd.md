## Problem Statement

TaskHub currently uses a flat category system where all categories (Electrician, Cleaner, Delivery, etc.) exist at the same level with no grouping or hierarchy. Users posting tasks see a long undifferentiated list of categories, making it hard to find the right service. There is no distinction between local home services, campus-specific tasks, and errands — even though these are fundamentally different use cases with different audiences. Campus tasks have no university association, so a student at University of Lagos sees campus tasks from all schools. Taskers similarly pick from a flat list during onboarding with no contextual grouping, and there's no way to indicate which university they serve.

## Solution

Restructure the category system into a two-tier hierarchy: **Main Categories** (e.g., Local Services, Campus Tasks, Errands & Deliveries) that act as navigation groups, and **Subcategories** (e.g., Electrician, Plumber, Laundry Pickup) that represent the actual services. Introduce a **University** model so campus tasks and campus taskers can be scoped to specific schools. The same subcategory name (e.g., Electrician) can exist under multiple main categories as separate entries for different contexts. The public category API stays flat — each subcategory carries a reference to its main category so the frontend can group them. Admins manage main categories, subcategories, and universities through new admin endpoints.

## User Stories

1. As a user on the homepage, I want to see main categories (Local Services, Campus Tasks, Errands & Deliveries), so that I can quickly navigate to the type of service I need.
2. As a user, I want to click a main category and see relevant subcategories, so that I can pick the exact service without scrolling through unrelated options.
3. As a user posting a task, I want the task form to have my selected main category and subcategory pre-filled, so that I don't have to re-select them.
4. As a user posting a campus task, I want to select my university, so that my task reaches campus taskers at my school.
5. As a user posting a local service or errand task, I want to skip university selection, so that the flow stays simple.
6. As a user, I want to select multiple subcategories within the same main category for my task, so that I can describe multi-skill jobs accurately.
7. As a user posting a task, I want the system to validate that my subcategories belong to my selected main category, so that I don't create mismatched tasks.
8. As a tasker during onboarding, I want to browse subcategories grouped by main category, so that I can easily find and select the services I offer.
9. As a tasker, I want to select subcategories across multiple main categories, so that I can offer services in different domains (e.g., Electrician under Local Services and Delivery under Errands).
10. As a campus tasker, I want to select my university, so that I only receive campus task notifications from my school.
11. As a campus tasker, I want to be notified only about campus tasks at my university, so that I don't get irrelevant notifications from other schools.
12. As a tasker with matching subcategories for a local or errand task, I want to be notified regardless of university, so that I don't miss non-campus opportunities.
13. As an admin, I want to create, update, and deactivate main categories, so that I can evolve the top-level navigation over time.
14. As an admin, I want to create subcategories under a specific main category, so that I can expand the service offerings per group.
15. As an admin, I want to create, update, and deactivate universities, so that I can manage which schools are available on the platform.
16. As an admin, I want to delete a main category only if no subcategories reference it, so that I don't break existing data.
17. As an admin, I want to delete a university only if no tasks or taskers reference it, so that I don't orphan records.
18. As a user browsing the public category list, I want each subcategory to include its main category reference, so that the frontend can group and display them correctly.
19. As a user, I want to see a list of active main categories from a public endpoint, so that the homepage can render the navigation.
20. As a user posting a campus task, I want to see a list of active universities, so that I can select mine.
21. As an existing user or tasker, I want my previously created tasks and selected categories to continue working, so that the migration doesn't break my data.
22. As a user viewing the "Top Workers near you" section, I want to still see each tasker's primary subcategory, so that the display is unaffected by the restructure.

## Implementation Decisions

- **MainCategory model (new)**: Fields — `name` (unique, lowercase), `displayName`, `description`, `icon`, `isActive` (default true), `createdBy` (ref Admin/User), `createdAt`, `updatedAt`. Admin-managed via CRUD endpoints.
- **University model (new)**: Fields — `name` (unique), `abbreviation`, `state`, `location` (text description), `logo`, `isActive` (default true), `createdBy` (ref Admin/User), `createdAt`, `updatedAt`. Admin-managed via CRUD endpoints.
- **Category model enhancement**: Add a required `mainCategory` field (ObjectId ref to MainCategory). Existing flat categories become subcategories. All other fields (`name`, `displayName`, `description`, `icon`, `minimumPrice`, `isActive`, `createdBy`) remain unchanged.
- **Task model enhancement**: Add required `mainCategory` field (ObjectId ref to MainCategory). Add optional `university` field (ObjectId ref to University) — required when `mainCategory` is Campus Tasks type. `categories` array (subcategories) must all belong to the selected `mainCategory`.
- **Tasker model enhancement**: Add optional `university` field (ObjectId ref to University). `categories` array unchanged — taskers can select subcategories across multiple main categories.
- **Same subcategory in multiple main categories**: "Electrician" under Local Services and "Electrician" under Campus Tasks are two separate Category documents, each referencing a different MainCategory.
- **Task creation validation**: Validate `mainCategory` exists and is active. Validate all `categories` (subcategories) exist, are active, and belong to the provided `mainCategory`. If `mainCategory` is campus-type, `university` is required and validated.
- **Tasker category update**: Extend `PUT /auth/categories` to optionally accept `university`. No restriction on selecting subcategories across main categories.
- **Notification matching update**: For campus tasks, filter taskers by matching subcategory AND matching university. For non-campus tasks, match on subcategory only (existing behavior).
- **Public API**: `GET /api/categories` stays flat — each category now includes populated `mainCategory` for frontend grouping. Add `GET /api/main-categories` returning active main categories. Add `GET /api/universities` returning active universities.
- **Admin endpoints — MainCategory CRUD**: `GET /api/admin/main-categories` (list all), `POST /api/admin/main-categories` (create), `PATCH /api/admin/main-categories/:id` (update), `DELETE /api/admin/main-categories/:id` (delete with safety check — no subcategories reference it).
- **Admin endpoints — University CRUD**: `GET /api/admin/universities` (list all), `POST /api/admin/universities` (create), `PATCH /api/admin/universities/:id` (update), `DELETE /api/admin/universities/:id` (delete with safety check — no tasks/taskers reference it).
- **Admin category creation**: Updated to require `mainCategory` field when creating a new subcategory.
- **Nearby taskers endpoint**: Continues to work unchanged — populates `primaryCategory` from the first entry in tasker's `categories` array, which still references the Category (subcategory) model.
- **Existing data**: No migration needed. Admin will create main categories and new subcategories fresh. Existing categories in the database can be assigned a `mainCategory` manually by the admin or phased out.

## Testing Decisions

- No tests required for the initial implementation.
- Good tests for this feature would test external behavior only: given main categories, subcategories, and universities in the database, verify API responses return correct groupings, task creation validates subcategory-to-main-category membership, campus tasks require university, and notification matching respects university scoping.
- Prior art: `test-endpoints.js` and `test-nin-service.js` in the project root.

## Out of Scope

- Frontend implementation (this PRD covers backend API only)
- Migrating existing Category documents to assign them a mainCategory — admin will handle manually
- Search/filtering tasks by main category (separate feature)
- University verification (e.g., student email verification)
- Campus-specific pricing or budgets
- Geofencing campus task delivery areas
- Tasker profileDetail page or public tasker directory
- Rate limiting or caching on new endpoints

## Further Notes

- The 3 initial main categories (Local Services, Campus Tasks, Errands & Deliveries) are seeded by the admin using the CRUD endpoints — not hardcoded.
- The `university` field on Task and Tasker is designed to be optional at the model level. The business rule "required for campus tasks" is enforced in the controller/validation layer, not the schema, so the model stays flexible.
- The `mainCategory` field added to Category is required at the schema level — every subcategory must belong to a main category. Existing Category documents in the database will need this field populated before they can be updated/saved again.
- The same `displayName` can exist across multiple main categories (e.g., "Electrician" under Local Services and "Electrician" under Campus Tasks), but the unique `name` field should differentiate them (e.g., `electrician-local` vs `electrician-campus`).
- Admin role guards follow the existing pattern: super_admin and operations roles can create/update, super_admin only can delete.
