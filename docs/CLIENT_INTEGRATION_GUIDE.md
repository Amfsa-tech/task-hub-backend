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
