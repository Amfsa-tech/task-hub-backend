# Plan: Nearby Taskers

> Source PRD: Nearby Taskers PRD (conversation-based, March 2026)

## Architectural decisions

Durable decisions that apply across all phases:

- **Route**: `GET /api/taskers/nearby` — public, no authentication required
- **Schema**: No changes. Tasker model already stores `location.latitude`, `location.longitude`. Task model already tracks `assignedTasker` and `status` for job count aggregation.
- **Key models**: Tasker, Task, Category
- **Authentication**: None — endpoint is publicly accessible
- **Query parameters**: `latitude` (Number, optional), `longitude` (Number, optional) — must be provided together or neither
- **Validation**: latitude ∈ [-90, 90], longitude ∈ [-180, 180]
- **Radius**: 10 km default
- **Result limit**: 6 taskers max
- **Sort**: `averageRating` descending
- **Fallback**: When no coordinates provided, return top 6 active taskers by rating regardless of location
- **Response shape**: `{ success, data: [{ _id, firstName, lastName, profilePicture, averageRating, completedJobs, primaryCategory, area, residentState, distance? }] }`
- **Reused utilities**: Existing location utils (Haversine, bounding box) already in the codebase

---

## Phase 1: Top-Rated Taskers Endpoint (No Location)

**User stories**: 3, 4, 5, 6, 7, 8, 9, 10, 11

### What to build

A complete vertical slice from route to database and back: a public `GET /api/taskers/nearby` endpoint that returns the top 6 active taskers sorted by highest `averageRating`. For each tasker, aggregate their completed job count from the Task collection (where `assignedTasker` matches and `status === 'completed'`), and populate the first entry of their `categories` array to get `displayName` as the primary category. Return `firstName`, `lastName`, `profilePicture`, `averageRating`, `completedJobs`, `primaryCategory`, `area`, and `residentState`. Mount the route in the application entry point. No authentication middleware. This phase delivers the fallback behavior — the section works even when no GPS coordinates are available.

### Acceptance criteria

- [x] `GET /api/taskers/nearby` returns 200 with up to 6 taskers
- [x] Only taskers with `isActive: true` are returned
- [x] Results are sorted by `averageRating` descending
- [x] Each tasker includes `completedJobs` count (aggregated from Task collection)
- [x] Each tasker includes `primaryCategory` (displayName from first category)
- [x] Each tasker includes `firstName`, `lastName`, `profilePicture`, `area`, `residentState`
- [x] Endpoint requires no authentication (publicly accessible)
- [x] Response shape matches `{ success: true, data: [...] }`

---

## Phase 2: Location-Aware Filtering

**User stories**: 1, 2

### What to build

Extend the endpoint from Phase 1 to accept optional `latitude` and `longitude` query parameters. Validate that both are provided together and within valid ranges. When coordinates are present, apply a two-stage location filter: first a bounding box pre-filter at 10 km radius against the tasker's stored `location.latitude` and `location.longitude`, then a precise Haversine distance calculation using the existing location utilities. Only taskers within 10 km are included. Results remain sorted by `averageRating` descending. Each result includes a `distance` field (in km). When coordinates are missing or invalid, fall back to Phase 1 behavior (top-rated regardless of location, no `distance` field).

### Acceptance criteria

- [x] `GET /api/taskers/nearby?latitude=6.5&longitude=3.4` filters to taskers within 10 km
- [x] Latitude validated to [-90, 90], longitude validated to [-180, 180]
- [x] Both `latitude` and `longitude` must be provided together; one without the other falls back to no-location behavior
- [x] Each result includes `distance` (in km) when coordinates are provided
- [x] Distance calculation uses the existing Haversine utility
- [x] Two-stage filtering applied: bounding box first, then precise distance
- [x] When no coordinates provided, behavior is identical to Phase 1 (no `distance` field)
