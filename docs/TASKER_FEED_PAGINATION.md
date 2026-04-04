# Tasker Feed — Cursor-Based Pagination

## What Changed

The `GET /api/tasks/tasker/feed` endpoint now supports **cursor-based pagination** to prevent tasks from disappearing when new ones are posted. The `304 Not Modified` caching issue has also been resolved.

## Endpoint

```
GET /api/tasks/tasker/feed
```

### Query Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | `_id` of the last task from the previous response. Omit for the first page. |
| `limit` | number | `10` | Number of tasks per page |
| `maxDistance` | number | `200` | Max distance in miles from tasker's location |
| `biddingOnly` | boolean | `false` | Only return bidding-enabled tasks |
| `budget_min` | number | — | Minimum budget filter |
| `budget_max` | number | — | Maximum budget filter |
| `page` | number | `1` | **Legacy only.** Offset-based page number. Ignored when `cursor` is provided. |

## Usage

### Initial Load

```
GET /api/tasks/tasker/feed?maxDistance=200&limit=10
```

### Load More (Infinite Scroll)

Pass `nextCursor` from the previous response:

```
GET /api/tasks/tasker/feed?maxDistance=200&limit=10&cursor=665f6a7b8c9d0e1f20304050
```

### Pull to Refresh

Omit `cursor` to get the latest tasks from the top:

```
GET /api/tasks/tasker/feed?maxDistance=200&limit=10
```

## Response

```json
{
  "status": "success",
  "message": "Tasker feed retrieved successfully",
  "tasks": [ ... ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalTasks": 48,
    "hasNextPage": true,
    "hasPrevPage": false,
    "tasksPerPage": 10,
    "nextCursor": "665f6a7b8c9d0e1f20304041"
  }
}
```

### Key Fields

- **`pagination.nextCursor`** — Pass this as the `cursor` query param to fetch the next page.
- **`pagination.hasNextPage`** — `false` when there are no more tasks to load.

## Client Implementation Example

```javascript
let nextCursor = null;

// Initial load or pull-to-refresh
async function loadFeed() {
  nextCursor = null;
  const res = await fetch('/api/tasks/tasker/feed?maxDistance=200&limit=10');
  const data = await res.json();
  nextCursor = data.pagination.nextCursor;
  setTasks(data.tasks); // replace task list
}

// Infinite scroll / "Load More"
async function loadMore() {
  if (!nextCursor) return;
  const res = await fetch(`/api/tasks/tasker/feed?maxDistance=200&limit=10&cursor=${nextCursor}`);
  const data = await res.json();
  nextCursor = data.pagination.nextCursor;
  appendTasks(data.tasks); // append to existing list
}
```

## Migration Notes

- The legacy `page` parameter still works if `cursor` is not provided. No breaking changes.
- The response header `Cache-Control: no-store` is now set, so clients will always receive fresh data (no more `304` responses).
