# Tasker Portfolio — Previous Work & Website Link

Taskers can showcase their work by uploading images of previous jobs and optionally adding a website or portfolio link.

---

## Data Model

Two fields added to the **Tasker** schema:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `previousWork` | `[{ url: String, publicId: String }]` | `[]` | Array of uploaded work images (max 10) |
| `websiteLink` | `String` | `''` | Optional portfolio/website URL |

---

## Endpoints

### 1. Upload Previous Work Images

Uploads images and **appends** them to the tasker's existing `previousWork` array.

```
POST /api/auth/previous-work
Authorization: Bearer <tasker_token>
Content-Type: multipart/form-data
```

**Request body** (form-data):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `images` | file(s) | Yes | 1–5 image files per request |

**Constraints:**

- Max **5 files per request**
- Max **10 images total** on the tasker profile
- Max **20 MB** per file
- Allowed types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Images are stored in Cloudinary under `taskhub/previous-work/`

**Success response** `200`:

```json
{
  "status": "success",
  "message": "Previous work uploaded successfully",
  "previousWork": [
    {
      "url": "https://res.cloudinary.com/.../taskhub/previous-work/abc123.jpg",
      "publicId": "taskhub/previous-work/abc123"
    },
    {
      "url": "https://res.cloudinary.com/.../taskhub/previous-work/def456.jpg",
      "publicId": "taskhub/previous-work/def456"
    }
  ]
}
```

**Error responses:**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `At least one image is required` | No files in request |
| `400` | `Maximum 10 previous work images allowed. You have X, tried to add Y` | Would exceed 10-image cap |
| `400` | `File too large. Maximum size is 20 MB` | Single file exceeds limit |
| `400` | `Invalid file type: ...` | Non-image file sent |
| `400` | `Too many files. Maximum is 5 images` | More than 5 files in one request |
| `500` | `Failed to upload previous work` | Cloudinary error |

---

### 2. Delete a Previous Work Image

Removes a single image from the tasker's `previousWork` array by its Cloudinary `publicId`.

```
DELETE /api/auth/previous-work
Authorization: Bearer <tasker_token>
Content-Type: application/json
```

**Request body:**

```json
{
  "publicId": "taskhub/previous-work/abc123"
}
```

**Success response** `200`:

```json
{
  "status": "success",
  "message": "Previous work image removed",
  "previousWork": [
    {
      "url": "https://res.cloudinary.com/.../taskhub/previous-work/def456.jpg",
      "publicId": "taskhub/previous-work/def456"
    }
  ]
}
```

**Error responses:**

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `publicId is required` | Missing field |
| `404` | `Image not found in previous work` | No matching publicId |

---

### 3. Update Website Link

Use the existing profile update endpoint. The `websiteLink` field is accepted for taskers only.

```
PUT /api/auth/profile
Authorization: Bearer <tasker_token>
Content-Type: application/json
```

**Request body:**

```json
{
  "websiteLink": "https://myportfolio.com"
}
```

To clear the link, send an empty string:

```json
{
  "websiteLink": ""
}
```

**Success response** `200`:

```json
{
  "status": "success",
  "message": "Profile updated successfully",
  "user": { "...tasker fields...", "websiteLink": "https://myportfolio.com" }
}
```

---

## Client Integration Examples

### JavaScript (Web)

```js
// Upload previous work
const form = new FormData();
form.append('images', file1);
form.append('images', file2);

const res = await fetch('/api/auth/previous-work', {
  method: 'POST',
  headers: { Authorization: `Bearer ${taskerToken}` },
  // Do NOT set Content-Type — browser sets multipart boundary automatically
  body: form,
});
const data = await res.json();
console.log(data.previousWork); // updated array
```

### React Native

```js
// Upload previous work
const form = new FormData();
form.append('images', {
  uri: 'file:///path/to/photo1.jpg',
  name: 'work1.jpg',
  type: 'image/jpeg',
});
form.append('images', {
  uri: 'file:///path/to/photo2.jpg',
  name: 'work2.jpg',
  type: 'image/jpeg',
});

const res = await fetch(`${BASE_URL}/api/auth/previous-work`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${taskerToken}` },
  body: form,
});

// Delete an image
await fetch(`${BASE_URL}/api/auth/previous-work`, {
  method: 'DELETE',
  headers: {
    Authorization: `Bearer ${taskerToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ publicId: 'taskhub/previous-work/abc123' }),
});

// Set website link
await fetch(`${BASE_URL}/api/auth/profile`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${taskerToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ websiteLink: 'https://myportfolio.com' }),
});
```

---

## Reading Portfolio Data

The `previousWork` array and `websiteLink` are returned in any endpoint that returns the tasker object:

- `GET /api/auth/tasker` — returns the authenticated tasker's full profile
- Admin endpoints that populate tasker data

```json
{
  "previousWork": [
    { "url": "https://...", "publicId": "taskhub/previous-work/abc" },
    { "url": "https://...", "publicId": "taskhub/previous-work/def" }
  ],
  "websiteLink": "https://myportfolio.com"
}
```
