# Client Integration Guide — Categories, Universities & Nearby Taskers

Base URL: `{{API_BASE_URL}}` (e.g., `https://api.ngtaskhub.com`)

---

## Table of Contents

1. [Integration Flow Overview](#integration-flow-overview)
2. [Main Categories](#1-get-main-categories)
3. [Subcategories](#2-get-subcategories)
4. [Universities](#3-get-universities)
5. [Create Task](#4-create-task)
6. [Tasker Onboarding — Update Categories & University](#5-update-tasker-categories--university)
7. [Get Tasker Profile](#6-get-tasker-profile)
8. [Nearby Taskers](#7-get-nearby-taskers)
9. [Admin — Category Management](#8-admin--category-management)
10. [Admin — Main Category Management](#9-admin--main-category-management)
11. [Admin — University Management](#10-admin--university-management)

---

## Integration Flow Overview

### Task Posting Flow

```
1. User opens "Post Task" screen
2. GET /api/main-categories       → Display main category cards (Local Services, Campus Tasks, Errands)
3. GET /api/categories             → Filter subcategories by selected mainCategory._id
4. If selected mainCategory is campus-type:
   GET /api/universities           → Show university picker
5. POST /api/tasks                 → Submit task with mainCategory, categories[], and university (if campus)
```

### Tasker Onboarding Flow

```
1. Tasker opens "Select Skills" screen
2. GET /api/main-categories       → Display main category tabs/groups
3. GET /api/categories             → Show subcategories grouped under each main category
4. GET /api/universities           → Show university picker (optional)
5. PUT /api/auth/categories        → Save selected categories[] and optional university
```

### Home Screen — Nearby Taskers

```
1. App obtains user's GPS coordinates (or skips if denied)
2. GET /api/taskers/nearby?latitude=...&longitude=...
3. Display top tasker cards
```

### Admin — Category Management Flow

```
1. Admin logs in → POST /api/admin/auth/login → receives admin JWT
2. Dashboard:
   GET /api/admin/categories           → View all categories with stats (active/inactive counts, task totals)
   GET /api/admin/main-categories      → View all main categories with subcategory counts
   GET /api/admin/universities         → View all universities

3. Drill-down:
   GET /api/admin/categories/:id       → View category details (stats, subcategories, recent tasks, taskers)

4. Create:
   POST /api/admin/main-categories     → Create new main category (top-level group)
   POST /api/admin/categories          → Create new subcategory (link to parent via parentCategory)
   POST /api/admin/universities        → Create new university

5. Update:
   PATCH /api/admin/main-categories/:id → Update name, display name, icon, active status
   PATCH /api/admin/categories/:id      → Update category properties
   PATCH /api/admin/universities/:id    → Update university properties

6. Delete (with safety checks):
   DELETE /api/admin/main-categories/:id → Blocked if subcategories exist
   DELETE /api/admin/categories/:id      → Blocked if tasks or taskers reference it
   DELETE /api/admin/universities/:id    → Blocked if tasks or taskers reference it
```

---

## 1. Get Main Categories

Returns all active top-level category groups. Use these to build the first step of category selection (e.g., tab bar or card grid).

**No authentication required.**

```
GET /api/main-categories
```

### Response `200 OK`

```json
{
  "status": "success",
  "count": 3,
  "mainCategories": [
    {
      "_id": "665a1b2c3d4e5f6a7b8c9d0e",
      "name": "local-services",
      "displayName": "Local Services",
      "description": "Everyday services in your area",
      "icon": "wrench"
    },
    {
      "_id": "665a1b2c3d4e5f6a7b8c9d0f",
      "name": "campus-tasks",
      "displayName": "Campus Tasks",
      "description": "University-scoped errands and services",
      "icon": "school"
    },
    {
      "_id": "665a1b2c3d4e5f6a7b8c9d10",
      "name": "errands",
      "displayName": "Errands",
      "description": "Quick errands and deliveries",
      "icon": "running"
    }
  ]
}
```

### Frontend Usage

- Cache this list on app load (it rarely changes).
- Use `_id` to filter subcategories.
- Use `displayName` for UI labels and `icon` for visual display.
- A main category whose `name` contains `"campus"` requires a university selection during task posting.

---

## 2. Get Subcategories

Returns all active subcategories. Each subcategory includes its parent `mainCategory` so you can group/filter client-side.

**No authentication required.**

```
GET /api/categories
```

### Response `200 OK`

```json
{
  "status": "success",
  "count": 12,
  "categories": [
    {
      "_id": "665b2c3d4e5f6a7b8c9d0e1f",
      "name": "electrician-local",
      "displayName": "Electrician",
      "description": "Electrical repairs and installation",
      "mainCategory": {
        "_id": "665a1b2c3d4e5f6a7b8c9d0e",
        "name": "local-services",
        "displayName": "Local Services"
      }
    },
    {
      "_id": "665b2c3d4e5f6a7b8c9d0e20",
      "name": "laundry-campus",
      "displayName": "Laundry Pickup",
      "description": "Laundry collection and delivery on campus",
      "mainCategory": {
        "_id": "665a1b2c3d4e5f6a7b8c9d0f",
        "name": "campus-tasks",
        "displayName": "Campus Tasks"
      }
    }
  ]
}
```

### Frontend Usage

Filter subcategories by the selected main category:

```js
const subcategories = allCategories.filter(
  cat => cat.mainCategory?._id === selectedMainCategoryId
);
```

---

## 3. Get Universities

Returns all active universities. Used when the selected main category is campus-type.

**No authentication required.**

```
GET /api/universities
```

### Response `200 OK`

```json
{
  "status": "success",
  "count": 5,
  "universities": [
    {
      "_id": "665c3d4e5f6a7b8c9d0e1f20",
      "name": "University of Lagos",
      "abbreviation": "UNILAG",
      "state": "Lagos",
      "location": "Akoka, Yaba, Lagos",
      "logo": "https://cdn.example.com/unilag-logo.png"
    },
    {
      "_id": "665c3d4e5f6a7b8c9d0e1f21",
      "name": "Obafemi Awolowo University",
      "abbreviation": "OAU",
      "state": "Osun",
      "location": "Ile-Ife, Osun",
      "logo": ""
    }
  ]
}
```

### Frontend Usage

- Cache this list (it rarely changes).
- Show the university picker only when the selected main category's `name` includes `"campus"`.
- Use `abbreviation` for compact display (badges, chips).

---

## 4. Create Task

Creates a new task. Requires user authentication.

```
POST /api/tasks
```

**Headers:**
```
Authorization: Bearer <user_token>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Task title |
| `description` | string | Yes | Detailed task description |
| `mainCategory` | string | Yes | ObjectId of the selected main category |
| `categories` | string[] | Yes | Array of subcategory ObjectIds (must belong to `mainCategory`) |
| `university` | string | Conditional | ObjectId of university. **Required** when `mainCategory` is campus-type. Optional otherwise. |
| `location.latitude` | number | Yes | Task location latitude |
| `location.longitude` | number | Yes | Task location longitude |
| `budget` | number | Yes | Task budget in Naira (must be > 0) |
| `isBiddingEnabled` | boolean | No | Enable bidding (default: `false`) |
| `deadline` | string | No | ISO 8601 date string (must be in the future) |
| `tags` | string[] | No | Tags for the task |
| `images` | object[] | No | Array of `{ url: string }` objects |

### Example — Campus Task

```json
{
  "title": "Pick up my laundry from hostel",
  "description": "Collect my laundry bag from Moremi Hall and deliver to the laundry shop near the gate",
  "mainCategory": "665a1b2c3d4e5f6a7b8c9d0f",
  "categories": ["665b2c3d4e5f6a7b8c9d0e20"],
  "university": "665c3d4e5f6a7b8c9d0e1f20",
  "location": {
    "latitude": 6.5158,
    "longitude": 3.3898
  },
  "budget": 1500,
  "deadline": "2026-04-01T18:00:00.000Z"
}
```

### Example — Local Services Task (no university)

```json
{
  "title": "Fix kitchen light switch",
  "description": "The light switch in my kitchen sparks when toggled",
  "mainCategory": "665a1b2c3d4e5f6a7b8c9d0e",
  "categories": ["665b2c3d4e5f6a7b8c9d0e1f"],
  "location": {
    "latitude": 6.4281,
    "longitude": 3.4219
  },
  "budget": 5000,
  "isBiddingEnabled": true
}
```

### Response `201 Created`

```json
{
  "status": "success",
  "message": "Task created successfully",
  "task": {
    "_id": "665d4e5f6a7b8c9d0e1f2030",
    "title": "Pick up my laundry from hostel",
    "description": "Collect my laundry bag...",
    "mainCategory": "665a1b2c3d4e5f6a7b8c9d0f",
    "categories": ["665b2c3d4e5f6a7b8c9d0e20"],
    "university": "665c3d4e5f6a7b8c9d0e1f20",
    "location": { "latitude": 6.5158, "longitude": 3.3898 },
    "budget": 1500,
    "isBiddingEnabled": false,
    "status": "open",
    "user": "665e5f6a7b8c9d0e1f203040",
    "createdAt": "2026-03-29T10:30:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | Missing required fields | `"Missing required fields"` with `missingFields` array |
| `400` | Empty categories array | `"At least one category is required"` |
| `400` | Invalid category ID format | `"Invalid category ID format at index {i}"` |
| `400` | Category not found/inactive | `"Some categories not found or inactive"` |
| `400` | Invalid mainCategory ID | `"Invalid mainCategory ID format"` |
| `400` | MainCategory not found/inactive | `"Main category not found or inactive"` |
| `400` | Subcategory-mainCategory mismatch | `"All subcategories must belong to the selected main category"` |
| `400` | Missing university for campus task | `"University is required for campus tasks"` |
| `400` | Invalid university ID | `"Invalid university ID format"` |
| `400` | University not found/inactive | `"University not found or inactive"` |
| `400` | Invalid budget | `"Invalid budget value"` |
| `400` | Invalid deadline | `"Invalid deadline"` |

---

## 5. Update Tasker Categories & University

Updates the tasker's selected subcategories and optionally their university affiliation. Requires tasker authentication.

```
PUT /api/auth/categories
```

**Headers:**
```
Authorization: Bearer <tasker_token>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `categories` | string[] | Yes | Array of subcategory ObjectIds (can span multiple main categories) |
| `university` | string \| null | No | ObjectId of university, or `null` to clear |

### Example — Set categories and university

```json
{
  "categories": [
    "665b2c3d4e5f6a7b8c9d0e1f",
    "665b2c3d4e5f6a7b8c9d0e20"
  ],
  "university": "665c3d4e5f6a7b8c9d0e1f20"
}
```

### Example — Update categories only (leave university unchanged)

```json
{
  "categories": [
    "665b2c3d4e5f6a7b8c9d0e1f"
  ]
}
```

### Example — Clear university

```json
{
  "categories": [
    "665b2c3d4e5f6a7b8c9d0e1f"
  ],
  "university": null
}
```

### Response `200 OK`

```json
{
  "status": "success",
  "message": "Categories updated successfully",
  "categories": [
    {
      "_id": "665b2c3d4e5f6a7b8c9d0e1f",
      "name": "electrician-local",
      "displayName": "Electrician",
      "description": "Electrical repairs and installation"
    }
  ]
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | Missing categories | `"Categories array is required"` |
| `400` | Not an array | `"Categories must be an array of category IDs"` |
| `400` | Invalid ObjectId in array | `"All categories must be valid ObjectId strings"` |
| `400` | Empty after dedup | `"At least one valid category is required"` |
| `400` | Category not found/inactive | `"Some categories are invalid or inactive"` |
| `400` | Invalid university ID | `"Invalid university ID format"` |
| `400` | University not found/inactive | `"University not found or inactive"` |
| `403` | Not a tasker account | `"This endpoint is only available for taskers"` |

---

## 6. Get Tasker Profile

Returns the authenticated tasker's profile, including populated categories and university.

```
GET /api/auth/tasker
```

**Headers:**
```
Authorization: Bearer <tasker_token>
```

### Response `200 OK`

```json
{
  "status": "success",
  "tasker": {
    "_id": "665f6a7b8c9d0e1f20304050",
    "firstName": "Adekola",
    "lastName": "Ogunbiyi",
    "emailAddress": "adekola@example.com",
    "phoneNumber": "+2348012345678",
    "profilePicture": "https://cdn.example.com/photo.jpg",
    "residentState": "Lagos",
    "wallet": 12500,
    "location": {
      "latitude": 6.5158,
      "longitude": 3.3898,
      "lastUpdated": "2026-03-29T08:00:00.000Z"
    },
    "categories": [
      {
        "_id": "665b2c3d4e5f6a7b8c9d0e1f",
        "name": "electrician-local",
        "displayName": "Electrician",
        "description": "Electrical repairs and installation",
        "isActive": true
      }
    ],
    "university": {
      "_id": "665c3d4e5f6a7b8c9d0e1f20",
      "name": "University of Lagos",
      "abbreviation": "UNILAG",
      "state": "Lagos"
    },
    "isEmailVerified": true,
    "verifyIdentity": true,
    "isKYCVerified": true,
    "lastLogin": "2026-03-29T09:15:00.000Z",
    "createdAt": "2026-01-15T12:00:00.000Z"
  }
}
```

> `university` will be `null` if the tasker has not set one.

---

## 7. Get Nearby Taskers

Returns up to 6 top-rated taskers near the provided coordinates, or the top-rated taskers globally if no coordinates are given.

**No authentication required.**

```
GET /api/taskers/nearby
GET /api/taskers/nearby?latitude=6.5158&longitude=3.3898
```

### Query Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `latitude` | number | No | User's latitude (-90 to 90) |
| `longitude` | number | No | User's longitude (-180 to 180) |

### Behavior

| Scenario | Result |
|---|---|
| Valid coordinates provided | Returns taskers within **10 km**, sorted by `averageRating` desc, max **6** results. Each result includes `distance` in km. |
| No coordinates / invalid coordinates | Falls back to top-rated active taskers globally (no `distance` field). Max **6** results. |

### Response `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "_id": "665f6a7b8c9d0e1f20304050",
      "firstName": "Adekola",
      "lastName": "Ogunbiyi",
      "profilePicture": "https://cdn.example.com/photo.jpg",
      "averageRating": 4.8,
      "completedJobs": 23,
      "primaryCategory": "Electrician",
      "area": null,
      "residentState": "Lagos",
      "distance": 2.3
    },
    {
      "_id": "665f6a7b8c9d0e1f20304051",
      "firstName": "Chioma",
      "lastName": "Nwosu",
      "profilePicture": "",
      "averageRating": 4.6,
      "completedJobs": 15,
      "primaryCategory": "Laundry Pickup",
      "area": null,
      "residentState": "Lagos",
      "distance": 4.1
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `_id` | string | Tasker ID |
| `firstName` | string | First name |
| `lastName` | string | Last name |
| `profilePicture` | string | Profile image URL (may be empty) |
| `averageRating` | number | Rating from 0–5 |
| `completedJobs` | number | Total completed tasks |
| `primaryCategory` | string \| null | Display name of the tasker's first category |
| `area` | string \| null | Tasker's area (if set) |
| `residentState` | string | State of residence |
| `distance` | number | Distance in km (only present when coordinates are provided) |

### Frontend Usage

```js
// Request user location, fall back gracefully
navigator.geolocation.getCurrentPosition(
  (pos) => {
    fetch(`${API_BASE}/api/taskers/nearby?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}`)
      .then(res => res.json())
      .then(data => renderTaskerCards(data.data));
  },
  () => {
    // No GPS — still works, returns top-rated globally
    fetch(`${API_BASE}/api/taskers/nearby`)
      .then(res => res.json())
      .then(data => renderTaskerCards(data.data));
  }
);
```

---

## Quick Reference

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/main-categories` | GET | None | List main category groups |
| `/api/categories` | GET | None | List subcategories (with `mainCategory` populated) |
| `/api/universities` | GET | None | List universities |
| `/api/tasks` | POST | User | Create a task |
| `/api/auth/categories` | PUT | Tasker | Update tasker's categories + university |
| `/api/auth/tasker` | GET | Tasker | Get tasker profile (with categories + university) |
| `/api/taskers/nearby` | GET | None | Get nearby / top taskers |

---

## Admin Authentication

All admin endpoints require a valid admin JWT token. Obtain one by logging in:

```
POST /api/admin/auth/login
Content-Type: application/json

{
  "email": "admin@taskhub.com",
  "password": "your_password"
}
```

Then pass the token in every admin request:

```
Authorization: Bearer <admin_token>
```

### Role-Based Access

| Role | View | Create | Update | Delete |
|------|------|--------|--------|--------|
| `super_admin` | Yes | Yes | Yes | Yes |
| `operations` | Yes | Yes | Yes | Yes |
| `trust_safety` | Yes | No | No | No |

---

## 8. Admin — Category Management

Admin endpoints for managing subcategories. Categories use a parent-child hierarchy — a category with `parentCategory: null` is a top-level category; one with a `parentCategory` ID is a subcategory.

All routes use prefix `/api/admin/categories` and require admin authentication.

### 8.1 Category Dashboard

Returns all top-level categories (where `parentCategory` is null) with aggregated stats.

```
GET /api/admin/categories
```

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Allowed Roles:** `super_admin`, `operations`, `trust_safety`

#### Response `200 OK`

```json
{
  "status": "success",
  "data": {
    "stats": {
      "activeCategories": 15,
      "closedCategories": 3,
      "totalServices": 482
    },
    "categories": [
      {
        "_id": "665a1b2c3d4e5f6a7b8c9d0e",
        "name": "plumbing",
        "displayName": "Plumbing",
        "description": "Plumbing services",
        "subCategoryCount": 4,
        "services": 78,
        "isActive": true
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `stats.activeCategories` | Count of active top-level categories |
| `stats.closedCategories` | Count of inactive top-level categories |
| `stats.totalServices` | Total tasks across all categories |
| `categories[].subCategoryCount` | Number of subcategories under this category |
| `categories[].services` | Number of tasks in this category and its subcategories |

---

### 8.2 Category Details

Returns detailed information for a single category including subcategories, recent tasks, taskers, and revenue stats.

```
GET /api/admin/categories/:id
```

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Allowed Roles:** `super_admin`, `operations`, `trust_safety`

#### Response `200 OK`

```json
{
  "status": "success",
  "data": {
    "category": {
      "_id": "665a1b2c3d4e5f6a7b8c9d0e",
      "name": "plumbing",
      "displayName": "Plumbing",
      "description": "Professional plumbing services",
      "isActive": true,
      "minimumPrice": 5000
    },
    "stats": {
      "totalServices": 156,
      "subCategoryCount": 4,
      "activeServices": 142,
      "activeTaskers": 32,
      "totalTaskers": 45,
      "revenue": 1250000
    },
    "subCategories": [
      {
        "_id": "665b2c3d4e5f6a7b8c9d0e1f",
        "displayName": "Pipe Installation",
        "isActive": true
      }
    ],
    "tasks": [
      {
        "_id": "665d4e5f6a7b8c9d0e1f2030",
        "title": "Fix kitchen sink",
        "postedBy": "John Doe",
        "budget": 15000,
        "status": "in_progress",
        "date": "2026-04-01T10:30:00Z"
      }
    ],
    "taskers": [
      {
        "_id": "665f6a7b8c9d0e1f20304050",
        "fullName": "Jane Smith",
        "emailAddress": "jane@example.com",
        "profilePicture": "https://cdn.example.com/photo.jpg",
        "isActive": true,
        "verifyIdentity": true,
        "lastActive": "2026-04-01T12:00:00Z"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `stats.revenue` | Sum of `budget` from completed tasks in this category |
| `tasks` | Most recent 20 tasks in this category |
| `taskers` | Most recent 20 taskers working in this category |

#### Error Responses

| Status | Message |
|--------|---------|
| `404` | `"Category not found"` |

---

### 8.3 Create Category

Creates a new category. Set `parentCategory` to create a subcategory under an existing category.

```
POST /api/admin/categories
```

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Allowed Roles:** `super_admin`, `operations`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Category name (auto-normalized to lowercase-hyphenated) |
| `displayName` | string | No | Display name for UI (defaults to `name`) |
| `description` | string | No | Category description |
| `minimumPrice` | number | No | Minimum task price (default: `0`) |
| `isActive` | boolean | No | Active status (default: `true`) |
| `parentCategory` | string | No | ObjectId of parent category (for subcategories) |

#### Example — Create a top-level category

```json
{
  "name": "Plumbing",
  "displayName": "Plumbing Services",
  "description": "All plumbing-related tasks",
  "minimumPrice": 5000
}
```

#### Example — Create a subcategory

```json
{
  "name": "Pipe Installation",
  "displayName": "Pipe Installation",
  "description": "Water pipe installation and repair",
  "parentCategory": "665a1b2c3d4e5f6a7b8c9d0e"
}
```

#### Response `201 Created`

```json
{
  "status": "success",
  "category": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "plumbing",
    "displayName": "Plumbing Services",
    "description": "All plumbing-related tasks",
    "minimumPrice": 5000,
    "isActive": true,
    "parentCategory": null,
    "createdBy": "507f1f77bcf86cd799439012",
    "createdAt": "2026-04-01T10:30:00Z",
    "updatedAt": "2026-04-01T10:30:00Z"
  }
}
```

#### Error Responses

| Status | Message |
|--------|---------|
| `400` | `"Category name exists"` |
| `404` | `"Parent category not found"` |

---

### 8.4 Update Category

Updates properties of an existing category. Only provided fields are changed.

```
PATCH /api/admin/categories/:id
```

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Allowed Roles:** `super_admin`, `operations`

#### Request Body (all fields optional)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New name (auto-normalized) |
| `displayName` | string | New display name |
| `description` | string | New description |
| `minimumPrice` | number | New minimum price |
| `isActive` | boolean | New active status |
| `parentCategory` | string | Change parent category |

#### Example

```json
{
  "displayName": "Plumbing Services Updated",
  "isActive": false
}
```

#### Response `200 OK`

```json
{
  "status": "success",
  "category": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "plumbing",
    "displayName": "Plumbing Services Updated",
    "isActive": false
  }
}
```

#### Error Responses

| Status | Message |
|--------|---------|
| `404` | `"Category not found"` |

---

### 8.5 Delete Category

Deletes a category. Blocked if the category has subcategories, tasks, or taskers referencing it.

```
DELETE /api/admin/categories/:id
```

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Allowed Roles:** `super_admin`, `operations`

#### Response `200 OK`

```json
{
  "status": "success",
  "message": "Category deleted successfully"
}
```

#### Error Responses

| Status | Condition | Example Message |
|--------|-----------|-----------------|
| `400` | Has subcategories | `"Cannot delete category. It contains 4 sub-categories. Please delete or reassign them first."` |
| `400` | Has tasks/taskers | `"Cannot delete category. It is used by 12 tasks and 5 taskers. Please reassign them or deactivate the category instead."` |
| `404` | Not found | `"Category not found"` |

> **Tip:** If a category is in use, deactivate it (`PATCH` with `isActive: false`) instead of deleting.

---

## 9. Admin — Main Category Management

Admin endpoints for managing top-level category groups (e.g., "Local Services", "Campus Tasks", "Errands"). Subcategories link to these via their `mainCategory` field.

All routes use prefix `/api/admin/main-categories` and require admin authentication.

### 9.1 List Main Categories

Returns all main categories with subcategory counts.

```
GET /api/admin/main-categories
```

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Allowed Roles:** `super_admin`, `operations`, `trust_safety`

#### Response `200 OK`

```json
{
  "status": "success",
  "data": {
    "mainCategories": [
      {
        "_id": "665a1b2c3d4e5f6a7b8c9d0e",
        "name": "local-services",
        "displayName": "Local Services",
        "description": "Everyday services in your area",
        "icon": "wrench",
        "isActive": true,
        "subcategories": 8,
        "createdAt": "2026-03-15T09:00:00Z"
      }
    ]
  }
}
```

---

### 9.2 Create Main Category

```
POST /api/admin/main-categories
```

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Allowed Roles:** `super_admin`, `operations`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Category name (auto-normalized to lowercase-hyphenated) |
| `displayName` | string | Yes | Display name for UI |
| `description` | string | No | Description (default: `""`) |
| `icon` | string | No | Icon URL or identifier (default: `""`) |

#### Example

```json
{
  "name": "Home Services",
  "displayName": "Home Services",
  "description": "All home maintenance and repair services",
  "icon": "home"
}
```

#### Response `201 Created`

```json
{
  "status": "success",
  "mainCategory": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "home-services",
    "displayName": "Home Services",
    "description": "All home maintenance and repair services",
    "icon": "home",
    "isActive": true,
    "createdBy": "507f1f77bcf86cd799439012",
    "createdAt": "2026-04-01T10:30:00Z"
  }
}
```

#### Error Responses

| Status | Message |
|--------|---------|
| `400` | `"Name and display name are required"` |
| `400` | `"Main category with this name already exists"` |

---

### 9.3 Update Main Category

Updates properties of an existing main category. Only provided fields are changed.

```
PATCH /api/admin/main-categories/:id
```

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Allowed Roles:** `super_admin`, `operations`

#### Request Body (all fields optional)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New name (auto-normalized) |
| `displayName` | string | New display name |
| `description` | string | New description |
| `icon` | string | New icon URL |
| `isActive` | boolean | New active status |

#### Example

```json
{
  "displayName": "Home & Property Services",
  "icon": "house"
}
```

#### Response `200 OK`

```json
{
  "status": "success",
  "mainCategory": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "home-services",
    "displayName": "Home & Property Services",
    "icon": "house",
    "isActive": true
  }
}
```

#### Error Responses

| Status | Message |
|--------|---------|
| `404` | `"Main category not found"` |

---

### 9.4 Delete Main Category

Deletes a main category. Blocked if any subcategories reference it.

```
DELETE /api/admin/main-categories/:id
```

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Allowed Roles:** `super_admin`, `operations`

#### Response `200 OK`

```json
{
  "status": "success",
  "message": "Main category deleted successfully"
}
```

#### Error Responses

| Status | Condition | Example Message |
|--------|-----------|-----------------|
| `400` | Has subcategories | `"Cannot delete main category. It has 8 subcategories. Please reassign or delete them first."` |
| `404` | Not found | `"Main category not found"` |

> **Safe deletion order:** Delete all subcategories first, then delete the main category.

---

## 10. Admin — University Management

Admin endpoints for managing universities. Universities are referenced by campus-type tasks and tasker profiles.

All routes use prefix `/api/admin/universities` and require admin authentication.

### 10.1 List Universities

Returns all universities sorted alphabetically by name.

```
GET /api/admin/universities
```

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Allowed Roles:** `super_admin`, `operations`, `trust_safety`

#### Response `200 OK`

```json
{
  "status": "success",
  "data": {
    "universities": [
      {
        "_id": "665c3d4e5f6a7b8c9d0e1f20",
        "name": "University of Lagos",
        "abbreviation": "UNILAG",
        "state": "Lagos",
        "location": "Akoka",
        "logo": "https://cdn.example.com/unilag-logo.png",
        "isActive": true,
        "createdBy": "507f1f77bcf86cd799439012",
        "createdAt": "2026-01-15T09:00:00Z"
      }
    ]
  }
}
```

---

### 10.2 Create University

```
POST /api/admin/universities
```

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Allowed Roles:** `super_admin`, `operations`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | University name (must be unique) |
| `abbreviation` | string | No | Short form (e.g., "UNILAG") |
| `state` | string | No | State location |
| `location` | string | No | Specific campus location |
| `logo` | string | No | Logo URL |

#### Example

```json
{
  "name": "University of Lagos",
  "abbreviation": "UNILAG",
  "state": "Lagos",
  "location": "Akoka, Yaba",
  "logo": "https://cdn.example.com/unilag-logo.png"
}
```

#### Response `201 Created`

```json
{
  "status": "success",
  "university": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "University of Lagos",
    "abbreviation": "UNILAG",
    "state": "Lagos",
    "location": "Akoka, Yaba",
    "logo": "https://cdn.example.com/unilag-logo.png",
    "isActive": true,
    "createdBy": "507f1f77bcf86cd799439012",
    "createdAt": "2026-04-01T10:30:00Z"
  }
}
```

#### Error Responses

| Status | Message |
|--------|---------|
| `400` | `"University name is required"` |
| `400` | `"University with this name already exists"` |

---

### 10.3 Update University

Updates properties of an existing university. Only provided fields are changed.

```
PATCH /api/admin/universities/:id
```

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Allowed Roles:** `super_admin`, `operations`

#### Request Body (all fields optional)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New name |
| `abbreviation` | string | New abbreviation |
| `state` | string | New state |
| `location` | string | New location |
| `logo` | string | New logo URL |
| `isActive` | boolean | New active status |

#### Example

```json
{
  "location": "Akoka, Yaba, Lagos",
  "isActive": false
}
```

#### Response `200 OK`

```json
{
  "status": "success",
  "university": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "University of Lagos",
    "abbreviation": "UNILAG",
    "location": "Akoka, Yaba, Lagos",
    "isActive": false
  }
}
```

#### Error Responses

| Status | Message |
|--------|---------|
| `404` | `"University not found"` |

---

### 10.4 Delete University

Deletes a university. Blocked if tasks or taskers reference it.

```
DELETE /api/admin/universities/:id
```

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Allowed Roles:** `super_admin`, `operations`

#### Response `200 OK`

```json
{
  "status": "success",
  "message": "University deleted successfully"
}
```

#### Error Responses

| Status | Condition | Example Message |
|--------|-----------|-----------------|
| `400` | In use | `"Cannot delete university. It is used by 45 tasks and 12 taskers."` |
| `404` | Not found | `"University not found"` |

> **Tip:** Deactivate (`PATCH` with `isActive: false`) instead of deleting when the university is in use.

---

## Quick Reference

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/main-categories` | GET | None | List main category groups |
| `/api/categories` | GET | None | List subcategories (with `mainCategory` populated) |
| `/api/universities` | GET | None | List universities |
| `/api/tasks` | POST | User | Create a task |
| `/api/auth/categories` | PUT | Tasker | Update tasker's categories + university |
| `/api/auth/tasker` | GET | Tasker | Get tasker profile (with categories + university) |
| `/api/taskers/nearby` | GET | None | Get nearby / top taskers |
| `/api/admin/categories` | GET | Admin | Category dashboard with stats |
| `/api/admin/categories/:id` | GET | Admin | Category details (tasks, taskers, revenue) |
| `/api/admin/categories` | POST | Admin | Create category or subcategory |
| `/api/admin/categories/:id` | PATCH | Admin | Update category |
| `/api/admin/categories/:id` | DELETE | Admin | Delete category (with safety checks) |
| `/api/admin/main-categories` | GET | Admin | List main categories with stats |
| `/api/admin/main-categories` | POST | Admin | Create main category |
| `/api/admin/main-categories/:id` | PATCH | Admin | Update main category |
| `/api/admin/main-categories/:id` | DELETE | Admin | Delete main category (with safety checks) |
| `/api/admin/universities` | GET | Admin | List all universities |
| `/api/admin/universities` | POST | Admin | Create university |
| `/api/admin/universities/:id` | PATCH | Admin | Update university |
| `/api/admin/universities/:id` | DELETE | Admin | Delete university (with safety checks) |
