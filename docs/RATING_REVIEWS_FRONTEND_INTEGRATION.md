# Rating & Reviews — Frontend Integration Guide

> Audience: Frontend developers and AI agents integrating the rating and review system into the client application.
> Base URL: `{{API_BASE_URL}}` (e.g., `https://api.ngtaskhub.com`)

---

## 1. Overview

The rating and review system allows users who have posted tasks to rate and review the tasker who completed the work. Ratings are submitted on a 1–5 star scale with an optional text review. Once submitted, the rating is permanently attached to the task and the tasker's public profile is updated with a recalculated average rating.

Tasker profiles publicly display all their reviews (excluding hidden ones) along with their overall average rating. This helps future users evaluate taskers before assigning them to tasks.

## 2. Prerequisites

- A valid **User JWT token** (taskers cannot submit ratings)
- The task must have status `completed`
- The task must have an assigned tasker
- The user must be the original task poster (owner)
- Each task can only be rated once (no re-rating)

## 3. Architecture in One Paragraph

After a task is marked as completed, the client presents a rating interface to the task owner. The client sends a star rating (1–5) and optional review text to the backend. The backend validates that the user owns the task, that it is completed, and that it has not already been rated. On success, the rating is saved to the task and the tasker's average rating is recalculated. The client can then display the tasker's public reviews by calling a separate public endpoint that returns paginated review data.

## 4. Full Flow Diagram

```
[Task marked as completed]
        |
        v
[Show "Rate Tasker" UI to task owner]
        |
        v
POST /api/tasks/:id/rate
{ rating: 4, reviewText: "Great work!" }
        |
   +----+----+----+----+----+----+
   |         |         |         |
 200 OK    400       403       409
   |         |         |         |
   v         v         v         v
Show     Show      Show      Show
success  validation not       already
message  error     authorized  rated
   |
   v
[Update tasker profile
 average rating]
        |
        v
GET /api/taskers/:id/reviews
        |
   +----+----+
   |         |
 200 OK    4xx Error
   |         |
   v         v
Display   Show empty
reviews   state
```

## 5. Endpoints

### 5.1 Submit Rating

**`POST /api/tasks/:id/rate`**

Auth: `Bearer <user_token>`

#### Request

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The task ID (MongoDB ObjectId) |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rating` | number | Yes | Star rating from 1 to 5 (inclusive) |
| `reviewText` | string | No | Optional review text. Maximum 500 characters |

**Request Body Example:**
```json
{
  "rating": 4,
  "reviewText": "Excellent work, very professional and on time!"
}
```

#### Response

**Success (200):**
```json
{
  "status": "success",
  "message": "Rating submitted successfully",
  "data": {
    "task": {
      "_id": "6628f1a2b4c5d6e7f8a9b0c1",
      "rating": 4,
      "reviewText": "Excellent work, very professional and on time!",
      "ratedAt": "2026-04-28T14:30:00.000Z"
    },
    "averageRating": 4.33
  }
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Invalid task ID format | `{ "status": "error", "message": "Invalid task ID format" }` |
| 400 | Rating missing | `{ "status": "error", "message": "Rating is required" }` |
| 400 | Rating out of range | `{ "status": "error", "message": "Rating must be a number between 1 and 5" }` |
| 400 | Review text too long | `{ "status": "error", "message": "Review text must not exceed 500 characters" }` |
| 400 | Task not completed | `{ "status": "error", "message": "Task must be completed before rating" }` |
| 400 | No assigned tasker | `{ "status": "error", "message": "Cannot rate a task with no assigned tasker" }` |
| 400 | Tasker unavailable | `{ "status": "error", "message": "Cannot rate: assigned tasker is no longer available" }` |
| 401 | Not authenticated | `{ "status": "error", "message": "Not authorized" }` |
| 403 | Not task owner | `{ "status": "error", "message": "Only the task owner can rate this task" }` |
| 404 | Task not found | `{ "status": "error", "message": "Task not found" }` |
| 409 | Already rated | `{ "status": "error", "message": "Task has already been rated" }` |

#### Frontend Implementation

**JavaScript (fetch):**
```js
const submitRating = async (taskId, rating, reviewText, token) => {
  const response = await fetch(`${BASE_URL}/api/tasks/${taskId}/rate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ rating, reviewText })
  });

  const data = await response.json();

  if (data.status === 'success') {
    showToast('Rating submitted successfully!', 'success');
    // Update local task state to reflect rated status
    updateTaskRating(taskId, data.data.task);
    // Update tasker average rating in profile state
    updateTaskerAverageRating(data.data.averageRating);
  } else {
    showToast(data.message, 'error');
  }

  return data;
};
```

**React Native:**
```js
const submitRating = async (taskId, rating, reviewText, token) => {
  const response = await fetch(`${BASE_URL}/api/tasks/${taskId}/rate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ rating, reviewText })
  });

  const data = await response.json();

  if (data.status === 'success') {
    Alert.alert('Success', 'Rating submitted successfully!');
    updateTaskRating(taskId, data.data.task);
    updateTaskerAverageRating(data.data.averageRating);
  } else {
    Alert.alert('Error', data.message);
  }

  return data;
};
```

---

### 5.2 Get Tasker Reviews

**`GET /api/taskers/:id/reviews`**

Auth: `None` (public endpoint)

#### Request

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The tasker ID (MongoDB ObjectId) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | No | Page number for pagination. Default: 1 |
| `limit` | number | No | Items per page. Default: 10, Max: 50 |

**Request Example:**
```
GET /api/taskers/6628f1a2b4c5d6e7f8a9b0c2/reviews?page=1&limit=10
```

#### Response

**Success (200):**
```json
{
  "status": "success",
  "message": "Tasker reviews retrieved successfully",
  "data": {
    "taskerId": "6628f1a2b4c5d6e7f8a9b0c2",
    "taskerName": "John Doe",
    "taskerProfilePicture": "https://res.cloudinary.com/example/profile.jpg",
    "taskerAverageRating": 4.33,
    "reviews": [
      {
        "taskId": "6628f1a2b4c5d6e7f8a9b0c1",
        "taskTitle": "Fix leaking kitchen pipe",
        "taskCategory": "Plumbing",
        "rating": 4,
        "reviewText": "Excellent work, very professional and on time!",
        "ratedAt": "2026-04-28T14:30:00.000Z",
        "reviewer": {
          "name": "Jane Smith",
          "profilePicture": "https://res.cloudinary.com/example/avatar.jpg"
        }
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 10,
      "pages": 2,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Invalid tasker ID format | `{ "status": "error", "message": "Invalid tasker ID format" }` |
| 404 | Tasker not found | `{ "status": "error", "message": "Tasker not found" }` |

#### Frontend Implementation

**JavaScript (fetch):**
```js
const getTaskerReviews = async (taskerId, page = 1, limit = 10) => {
  const response = await fetch(
    `${BASE_URL}/api/taskers/${taskerId}/reviews?page=${page}&limit=${limit}`
  );

  const data = await response.json();

  if (data.status === 'success') {
    return {
      reviews: data.data.reviews,
      averageRating: data.data.taskerAverageRating,
      taskerName: data.data.taskerName,
      taskerProfilePicture: data.data.taskerProfilePicture,
      pagination: data.data.pagination
    };
  } else {
    showToast(data.message, 'error');
    return null;
  }
};
```

**React Native:**
```js
const getTaskerReviews = async (taskerId, page = 1, limit = 10) => {
  const response = await fetch(
    `${BASE_URL}/api/taskers/${taskerId}/reviews?page=${page}&limit=${limit}`
  );

  const data = await response.json();

  if (data.status === 'success') {
    return {
      reviews: data.data.reviews,
      averageRating: data.data.taskerAverageRating,
      taskerName: data.data.taskerName,
      taskerProfilePicture: data.data.taskerProfilePicture,
      pagination: data.data.pagination
    };
  } else {
    Alert.alert('Error', data.message);
    return null;
  }
};
```

## 6. State Management

- **Task rating status**: Store in global task state. After a successful rating submission, update the task object locally to include `rating`, `reviewText`, and `ratedAt` so the UI can hide the rating form and show the submitted review.
- **Tasker reviews**: Cache in component or screen-level state. Reviews are public and do not change frequently; a 5-minute cache is reasonable.
- **Tasker average rating**: Update in the tasker profile state immediately after a successful rating submission to reflect the new `averageRating` returned in the response.
- **Pagination state**: Track `page`, `hasNextPage`, and `total` for infinite scroll or pagination controls on the reviews list.

## 7. Error Handling Guide

| Error | HTTP Status | Frontend Action |
|-------|-------------|-----------------|
| `"Rating is required"` | 400 | Highlight the rating input and show "Please select a star rating" |
| `"Rating must be a number between 1 and 5"` | 400 | Ensure the rating component only allows 1–5 selection |
| `"Review text must not exceed 500 characters"` | 400 | Show character counter and disable submit when over limit |
| `"Task must be completed before rating"` | 400 | Hide the rating UI until task status is `completed` |
| `"Cannot rate a task with no assigned tasker"` | 400 | Hide the rating UI if no tasker was assigned |
| `"Cannot rate: assigned tasker is no longer available"` | 400 | Show "This tasker is no longer active" and disable rating |
| `"Only the task owner can rate this task"` | 403 | Hide rating UI for non-owners; only show to task poster |
| `"Task has already been rated"` | 409 | Hide rating form and display the existing rating instead |
| `"Task not found"` | 404 | Show "Task not found" empty state |
| `"Invalid task ID format"` | 400 | Validate ID format client-side before calling API |
| `"Invalid tasker ID format"` | 400 | Validate ID format client-side before calling API |
| `"Tasker not found"` | 404 | Show "Tasker not found" empty state |
| Network error | N/A | Show offline/retry UI |

## 8. UI/UX Notes

- **Star rating input**: Use a 5-star interactive component. Allow half-star display for average ratings, but only whole-number submission (1–5).
- **Character counter**: Display "0/500" below the review text field and update in real time. Disable submit when over limit.
- **Conditional rating UI**: Only show the rating form when all conditions are met: user is task owner, task status is `completed`, task has an assigned tasker, and task has not been rated yet.
- **Loading states**: Show a spinner on the submit button while the rating request is in flight. Disable the button to prevent double submission.
- **Optimistic updates**: After successful submission, immediately update the task card to show the new rating and review text without waiting for a refetch.
- **Review list**: Display reviews in reverse chronological order (`ratedAt` descending). Show reviewer name, profile picture, task title, category, star rating, review text, and date.
- **Empty state**: If a tasker has no reviews, show "No reviews yet" with a neutral illustration.
- **Accessibility**: Ensure star ratings are keyboard-navigable and screen-reader friendly (announce "4 out of 5 stars").

## 9. Common Integration Patterns

### Pattern: Task Completion → Rating Flow
1. User marks task as completed (or tasker marks it complete and user confirms)
2. Client refetches task details via `GET /api/tasks/:id`
3. Check `task.status === 'completed'` and `task.rating` is absent
4. Show "Rate your tasker" modal or screen
5. User selects star rating and optionally writes a review
6. Call `POST /api/tasks/:id/rate`
7. On success, dismiss modal and show success toast
8. Update local task state with returned `rating`, `reviewText`, and `ratedAt`

### Pattern: Tasker Profile Reviews Tab
1. On tasker profile screen mount, call `GET /api/taskers/:id/reviews`
2. Display `taskerAverageRating` prominently at the top (e.g., "4.3 ★")
3. Render `reviews` array in a scrollable list
4. If `hasNextPage` is true, show "Load more" button or implement infinite scroll
5. On "Load more", increment `page` and append new reviews to the list

### Pattern: My Tasks List (Show Rating Status)
1. Fetch user's tasks via `GET /api/tasks/user/tasks`
2. For each completed task, check if `rating` field exists
3. If rated, show a small star icon with the rating number
4. If not rated, show a "Rate now" badge/button that navigates to the rating screen

## 10. Testing Checklist

- [ ] Unauthenticated access to `POST /api/tasks/:id/rate` returns 401 and redirects to login
- [ ] Tasker token on rating endpoint returns 403
- [ ] Rating submission with missing `rating` returns 400 with clear message
- [ ] Rating submission with `rating: 0` returns 400
- [ ] Rating submission with `rating: 6` returns 400
- [ ] Review text over 500 characters returns 400
- [ ] Rating a task that is not `completed` returns 400
- [ ] Rating a task without an assigned tasker returns 400
- [ ] Non-owner attempting to rate returns 403
- [ ] Rating an already-rated task returns 409
- [ ] Successful rating submission returns 200 and updates tasker average rating
- [ ] Public reviews endpoint returns data without authentication
- [ ] Invalid tasker ID returns 400
- [ ] Non-existent tasker ID returns 404
- [ ] Pagination works correctly (`page`, `limit`, `hasNextPage`)
- [ ] Loading spinner shows during rating submission
- [ ] Rating form is hidden after successful submission
- [ ] Review list displays correct reviewer names, ratings, and dates
- [ ] Network error shows retry UI

## 11. Changelog

| Date | Change | Breaking? |
|------|--------|-----------|
| 2026-04-28 | Initial guide | No |
