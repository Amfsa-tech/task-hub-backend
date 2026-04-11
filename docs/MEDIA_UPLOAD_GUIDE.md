# Media Upload — Client Integration Guide

All media uploads use **multipart/form-data**. The backend handles uploading files to Cloudinary and returns the hosted URLs in the response. Clients should **never** upload directly to Cloudinary.

---

## Constraints (All Endpoints)

| Rule | Value |
|------|-------|
| Max file size | **20 MB** per file |
| Max files per request | **5** |
| Task image types | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| Chat attachment types | All image types above **+** `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

---

## 1. Create Task

**`POST /api/tasks`**

Auth: `Bearer <user_token>`

### Request

`Content-Type: multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | text | Yes | |
| `description` | text | Yes | |
| `mainCategory` | text | Yes | ObjectId string |
| `categories` | text | Yes | **JSON string** — array of ObjectId strings, e.g. `["664abc...", "664def..."]` |
| `budget` | text | Yes | Number as string, e.g. `"5000"` |
| `location` | text | Yes | **JSON string** — `{"latitude": 6.5, "longitude": 3.3}` |
| `images` | file(s) | No | Up to 5 image files |
| `tags` | text | No | **JSON string** — array of strings, e.g. `["plumbing", "urgent"]` |
| `isBiddingEnabled` | text | No | `"true"` or `"false"` |
| `deadline` | text | No | ISO date string |
| `university` | text | No | ObjectId string (required for campus tasks) |

### Example (JavaScript — fetch)

```js
const form = new FormData();
form.append('title', 'Fix my kitchen sink');
form.append('description', 'Leaking pipe under the sink');
form.append('mainCategory', '664abc123...');
form.append('categories', JSON.stringify(['664def456...']));
form.append('budget', '5000');
form.append('location', JSON.stringify({ latitude: 6.524, longitude: 3.379 }));
form.append('images', fileInput.files[0]);
form.append('images', fileInput.files[1]);

const res = await fetch('/api/tasks', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

### Example (React Native — fetch)

```js
const form = new FormData();
form.append('title', 'Fix my kitchen sink');
form.append('description', 'Leaking pipe under the sink');
form.append('mainCategory', '664abc123...');
form.append('categories', JSON.stringify(['664def456...']));
form.append('budget', '5000');
form.append('location', JSON.stringify({ latitude: 6.524, longitude: 3.379 }));

// React Native file objects
form.append('images', {
  uri: 'file:///path/to/photo.jpg',
  name: 'photo.jpg',
  type: 'image/jpeg',
});

const res = await fetch(`${BASE_URL}/api/tasks`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    // Do NOT set Content-Type — fetch sets the multipart boundary automatically
  },
  body: form,
});
```

### Success Response — `201`

```json
{
  "status": "success",
  "message": "Task created successfully",
  "task": {
    "_id": "...",
    "title": "Fix my kitchen sink",
    "images": [
      { "url": "https://res.cloudinary.com/dhjxio8gy/image/upload/v.../taskhub/tasks/abc123.jpg", "publicId": "taskhub/tasks/abc123" },
      { "url": "https://res.cloudinary.com/dhjxio8gy/image/upload/v.../taskhub/tasks/def456.jpg", "publicId": "taskhub/tasks/def456" }
    ]
  }
}
```

---

## 2. Update Task

**`PUT /api/tasks/:id`**

Auth: `Bearer <user_token>`

### Request

`Content-Type: multipart/form-data`

Same fields as Create Task — all optional. Only include fields you want to update.

When new `images` files are uploaded, they **replace** the previous images entirely. If no `images` files are sent, existing images are preserved.

### Example

```js
const form = new FormData();
form.append('title', 'Updated title');
form.append('images', newPhotoFile); // replaces all previous images

const res = await fetch(`/api/tasks/${taskId}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

---

## 3. Send Chat Message

**`POST /api/chat/conversations/:id/messages`**

Auth: `Bearer <user_token>` or `Bearer <tasker_token>`

### Request

`Content-Type: multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `text` | text | No* | Message text |
| `attachments` | file(s) | No* | Up to 5 files (images, PDF, DOC, DOCX) |

\* At least one of `text` or `attachments` is required.

### Example (text + files)

```js
const form = new FormData();
form.append('text', "Here's the quote for the job");
form.append('attachments', pdfFile);
form.append('attachments', photoFile);

const res = await fetch(`/api/chat/conversations/${convoId}/messages`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

### Example (React Native)

```js
const form = new FormData();
form.append('text', 'Check this out');
form.append('attachments', {
  uri: 'file:///path/to/document.pdf',
  name: 'document.pdf',
  type: 'application/pdf',
});

const res = await fetch(`${BASE_URL}/api/chat/conversations/${convoId}/messages`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

### Success Response — `201`

```json
{
  "status": "success",
  "message": {
    "_id": "...",
    "conversation": "...",
    "senderType": "user",
    "text": "Here's the quote for the job",
    "attachments": [
      {
        "url": "https://res.cloudinary.com/dhjxio8gy/image/upload/v.../taskhub/chat/abc.pdf",
        "publicId": "taskhub/chat/abc",
        "type": "application/pdf",
        "name": "quote.pdf",
        "size": 204800
      }
    ],
    "status": "sent",
    "createdAt": "2026-04-11T..."
  }
}
```

---

## Error Responses

All upload errors return this shape:

```json
{
  "status": "error",
  "message": "..."
}
```

| Status | Message | Cause |
|--------|---------|-------|
| `400` | `File too large. Maximum size is 20 MB` | A single file exceeds 20 MB |
| `400` | `Too many files. Maximum is 5 images` | More than 5 files sent |
| `400` | `Invalid file type: audio/mp3. Allowed: image/jpeg, ...` | Unsupported MIME type |
| `400` | `Unexpected field: photos` | Wrong field name (use `images` for tasks, `attachments` for chat) |
| `500` | `Failed to upload images` / `Failed to upload attachments` | Cloudinary upload failed (retry) |

---

## Important Notes

1. **Do NOT set `Content-Type` header manually** — `fetch` / `axios` will set `multipart/form-data` with the correct boundary automatically when given a `FormData` body.

2. **Array and object fields must be JSON-stringified** — since multipart forms only support strings and files, fields like `categories`, `location`, and `tags` must be sent as `JSON.stringify(value)`.

3. **Field names matter** — task images must use field name **`images`**, chat files must use **`attachments`**. Any other name will be rejected.

4. **Text-only chat messages** still work — just send `text` with no files. The form can be multipart or plain JSON (multer passes through when no files are present).
