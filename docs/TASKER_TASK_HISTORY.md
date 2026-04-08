# Tasker Task History API

## Endpoint

```
GET /api/tasks/tasker/tasks
```

**Auth:** Tasker JWT required (`Authorization: Bearer <tasker_token>`)

## Query Parameters

| Param    | Type   | Required | Default | Description |
|----------|--------|----------|---------|-------------|
| `status` | string | No       | all     | Filter by: `assigned`, `in-progress`, `completed`, `cancelled` |
| `page`   | number | No       | 1       | Page number |
| `limit`  | number | No       | 10      | Results per page |

## Example Requests

```
// All tasks assigned to the tasker
GET /api/tasks/tasker/tasks

// Only completed tasks (history)
GET /api/tasks/tasker/tasks?status=completed

// Currently active tasks
GET /api/tasks/tasker/tasks?status=in-progress

// Page 2, 20 per page
GET /api/tasks/tasker/tasks?status=completed&page=2&limit=20
```

## Response (200)

```json
{
  "status": "success",
  "count": 3,
  "totalPages": 2,
  "currentPage": 1,
  "tasks": [
    {
      "_id": "664f...",
      "title": "Help me move furniture",
      "description": "...",
      "status": "completed",
      "budget": 5000,
      "location": { "latitude": 6.5, "longitude": 3.3, "address": "..." },
      "user": {
        "_id": "663a...",
        "firstName": "John",
        "lastName": "Doe",
        "profilePicture": "https://..."
      },
      "mainCategory": { "_id": "...", "name": "local-services", "displayName": "Local Services" },
      "subCategory": { "_id": "...", "name": "moving", "displayName": "Moving" },
      "createdAt": "2026-04-01T10:00:00.000Z"
    }
  ]
}
```

## Client Integration Flow

```
Tasker "My Tasks" Screen
├── Tab: Active    → GET /api/tasks/tasker/tasks?status=in-progress
├── Tab: Pending   → GET /api/tasks/tasker/tasks?status=assigned
├── Tab: Completed → GET /api/tasks/tasker/tasks?status=completed
└── Tab: All       → GET /api/tasks/tasker/tasks
    └── Infinite scroll: increment `page` param
```

## Fetch Example

```js
const getTaskerTasks = async (token, status = '', page = 1, limit = 10) => {
  const params = new URLSearchParams({ page, limit });
  if (status) params.append('status', status);

  const res = await fetch(`${API_BASE_URL}/api/tasks/tasker/tasks?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
};
```

## Error Responses

| Status | Meaning |
|--------|---------|
| 401    | Missing or invalid tasker token |
| 500    | Server error fetching tasks |
