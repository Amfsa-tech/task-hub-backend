# Frontend Integration Guide Template

This is the canonical template for generating frontend integration guides. Follow this structure when producing a guide. Every section is described with its purpose and what to include. Sections marked with [CONDITIONAL] should be included only when relevant to the feature being documented.

---

## Template Structure

```markdown
# [Feature Name] — Frontend Integration Guide

> Audience: Frontend developers and AI agents integrating this feature into the client application.
> Base URL: `{{API_BASE_URL}}` (e.g., `https://api.ngtaskhub.com`)

---

## 1. Overview

[1-2 paragraphs explaining what the feature does in plain language. No backend jargon. Focus on what the frontend developer needs to understand about the feature's purpose and user-facing behavior.]

## 2. Prerequisites

[Bulleted list of things the frontend developer must have or configure before integrating:]
- Authentication requirements (which user type, which token)
- Environment variables or config keys needed
- Third-party SDKs or libraries to install
- Other features that must be integrated first (dependencies)

## 3. Architecture in One Paragraph

[Explain the data flow in simple terms: what the client sends, what the backend returns, and what the client should do with it. Use plain language, not backend implementation details. If there's a state machine or lifecycle, describe it here.]

## 4. Full Flow Diagram

[ASCII or Mermaid diagram showing the complete integration flow from the frontend perspective. Include all branches: success paths, error paths, and conditional paths. Use simple arrows and labels.]

Example:
```
[Client Action] --request--> POST /api/endpoint { body }
                                |
                +---------------+---------------+
                |               |               |
           200 success    404 not_found    4xx/5xx error
        (proceed with       (show setup       (show error
         returned data)      form)             message)
```

## 5. Endpoints

[For each endpoint, document with this exact structure:]

### 5.X [Endpoint Name]

**`[METHOD] [PATH]`**

Auth: `[None | Bearer <user_token> | Bearer <tasker_token> | Bearer <admin_token>]`

#### Request

[Use a table for parameters. Distinguish between body params, query params, and path params.]

**Query Parameters** (if any):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `param` | string | Yes | What it does |

**Request Body** (if any):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field` | string | Yes | What it does |

**Request Body Example:**
```json
{
  "field": "value"
}
```

#### Response

**Success (200/201):**
```json
{
  "status": "success",
  "message": "Human-readable message",
  "data": { }
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Validation error | `{ "status": "error", "message": "..." }` |
| 401 | Not authenticated | `{ "status": "error", "message": "..." }` |
| 403 | Not authorized | `{ "status": "error", "message": "..." }` |
| 404 | Not found | `{ "status": "error", "message": "..." }` |

#### Frontend Implementation

[Provide a concrete code example for the most common client platform. Include:]
- How to construct the request
- How to handle the response
- What to store (state, localStorage, etc.)
- What to display to the user

**JavaScript (fetch):**
```js
const response = await fetch(`${BASE_URL}/api/endpoint`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ field: value })
});
const data = await response.json();
```

**React Native (fetch):**
```js
// Platform-specific notes (e.g., file upload handling)
```

## 6. State Management [CONDITIONAL]

[If the feature requires the frontend to manage state across screens or sessions, document:]
- What data to cache and for how long
- When to invalidate or refetch
- Where to store (global state, context, localStorage, etc.)
- Any real-time or polling requirements

## 7. Error Handling Guide

[Table of all possible error codes/messages and what the frontend should do for each:]

| Error | HTTP Status | Frontend Action |
|-------|-------------|-----------------|
| `"message string"` | 400 | Show validation error, highlight field |
| `"message string"` | 401 | Redirect to login |
| `"message string"` | 403 | Show "not authorized" message |
| `"message string"` | 404 | Show "not found" or empty state |
| Network error | N/A | Show offline/retry UI |

## 8. UI/UX Notes [CONDITIONAL]

[Frontend-specific guidance that isn't obvious from the API alone:]
- Loading states and when to show spinners
- Optimistic updates (when safe to do so)
- Debouncing or throttling recommendations
- Accessibility considerations
- Mobile-specific behavior (permissions, deep links, etc.)

## 9. Common Integration Patterns [CONDITIONAL]

[For features with multiple integration points, show the typical screen-by-screen flow:]

### Pattern: [Screen Name]
1. On mount, call `GET /api/...`
2. Display results in [component type]
3. On user action, call `POST /api/...`
4. Update local state with response

## 10. Testing Checklist

[Checklist for the frontend developer to verify their integration:]
- [ ] Unauthenticated access returns 401 and redirects to login
- [ ] Successful request displays correct data
- [ ] Validation errors highlight the correct fields
- [ ] Loading states show and hide correctly
- [ ] Network errors show retry UI
- [ ] [Feature-specific test cases]

## 11. Changelog

| Date | Change | Breaking? |
|------|--------|-----------|
| YYYY-MM-DD | Initial guide | No |
```

---

## Guidelines for Filling the Template

### Tone and Style
- Write for a frontend developer who has NO knowledge of the backend implementation
- Use "the client" or "the frontend" — never "you" or "we"
- Prefer tables over paragraphs for structured data (params, errors, responses)
- Every endpoint must have a concrete code example (at minimum JavaScript fetch)
- Include realistic example values, not `foo`, `bar`, or `...`

### What to Include
- Every field the frontend must send, with exact type and format
- Every field the frontend will receive, with exact type
- Every error case the frontend must handle
- The exact `Authorization` header format required
- Multipart form-data field names and formats (JSON-stringified fields, file fields)
- Query parameter names and valid values

### What NOT to Include
- Backend implementation details (database schemas, middleware, services)
- Internal error handling or logging
- Admin-only endpoints (unless the guide is specifically for admin features)
- Deployment or infrastructure details

### Conditional Sections
- **State Management**: Include when the feature spans multiple screens or requires caching
- **UI/UX Notes**: Include when there are non-obvious frontend behaviors (loading states, permissions, etc.)
- **Common Integration Patterns**: Include when the feature has a multi-step user flow across screens

### Code Examples
- Always provide JavaScript `fetch` as the baseline
- Add React Native examples when the feature involves file uploads, device permissions, or platform-specific APIs
- Use `BASE_URL` as a placeholder for the API base URL
- Use `token` as a placeholder for the JWT token
- Show error handling in at least one example per guide