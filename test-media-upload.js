/**
 * Test script for media upload endpoints.
 *
 * Usage:
 *   1. Start the server:  npm run dev
 *   2. Set a valid USER token below (or let it register/login automatically)
 *   3. Run:  node test-media-upload.js
 *
 * This script creates a tiny in-memory PNG so no external file is needed.
 */

const BASE_URL = 'http://localhost:3009/api';

// ──────────────────────────────────────────────
// PASTE A VALID USER TOKEN HERE to skip login,
// or leave empty to auto-register + login.
// ──────────────────────────────────────────────
let USER_TOKEN = '';

// ──── helpers ────

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};
const ok = (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`);
const fail = (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`);
const info = (msg) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`);

/**
 * Create a minimal valid PNG buffer (1×1 red pixel).
 * No file system needed — works entirely in memory.
 */
function createTestPng() {
  // Minimal 1x1 red PNG (67 bytes)
  const base64Png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  return Buffer.from(base64Png, 'base64');
}

/** Create a minimal PDF buffer */
function createTestPdf() {
  const pdfContent = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF`;
  return Buffer.from(pdfContent);
}

// ──── auto-login ────

async function ensureToken() {
  if (USER_TOKEN) return;

  info('No token set — registering + logging in a test user...');
  const email = `upload-test-${Date.now()}@example.com`;
  const password = 'TestUpload123!';

  try {
    await fetch(`${BASE_URL}/auth/user-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Upload Test User',
        emailAddress: email,
        phoneNumber: `+1${Date.now().toString().slice(-10)}`,
        password,
        country: 'Nigeria',
        residentState: 'Lagos',
        originState: 'Lagos',
        address: '1 Test Street',
        dateOfBirth: '1995-01-01',
      }),
    });
  } catch {}

  const loginRes = await fetch(`${BASE_URL}/auth/user-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailAddress: email, password }),
  });
  const loginData = await loginRes.json();

  if (loginData.token) {
    USER_TOKEN = loginData.token;
    ok(`Logged in — token: ${USER_TOKEN.slice(0, 20)}...`);
  } else {
    fail('Auto-login failed. Paste a valid token in USER_TOKEN and retry.');
    console.log('  Login response:', JSON.stringify(loginData, null, 2));
    process.exit(1);
  }
}

// ──── test: create task with images ────

async function testCreateTaskWithImages() {
  console.log('\n━━━ TEST 1: Create Task with Image Upload ━━━');

  // First get a valid category + mainCategory
  info('Fetching categories...');
  const catRes = await fetch(`${BASE_URL}/categories`);
  const catData = await catRes.json();

  if (!catData.categories || catData.categories.length === 0) {
    fail('No categories in DB — cannot create a task. Seed categories first.');
    return null;
  }

  // Find a main category and a sub-category
  const mainCat = catData.categories.find((c) => !c.parentCategory);
  const subCat = catData.categories.find(
    (c) => c.parentCategory && c.parentCategory === (mainCat?._id || mainCat?.id)
  );

  if (!mainCat) {
    fail('No main category found.');
    return null;
  }

  const categoryId = subCat?._id || subCat?.id || mainCat._id || mainCat.id;
  const mainCategoryId = mainCat._id || mainCat.id;

  info(`Using mainCategory: ${mainCategoryId}, subCategory: ${categoryId}`);

  // Check if we need a university (campus categories)
  let universityId = null;
  try {
    const uniRes = await fetch(`${BASE_URL}/universities`, {
      headers: { Authorization: `Bearer ${USER_TOKEN}` },
    });
    const uniData = await uniRes.json();
    const unis = uniData.universities || uniData.data || [];
    if (unis.length > 0) {
      universityId = unis[0]._id || unis[0].id;
      info(`Found university: ${universityId}`);
    }
  } catch {}

  // Build multipart form
  const form = new FormData();
  form.append('title', 'Media Upload Test Task');
  form.append('description', 'Testing image upload via multipart form-data');
  form.append('mainCategory', mainCategoryId);
  form.append('categories', JSON.stringify([categoryId]));
  form.append('budget', '3000');
  form.append('location', JSON.stringify({ latitude: 6.524, longitude: 3.379 }));
  if (universityId) form.append('university', universityId);

  // Attach 2 test PNG files
  const png1 = new Blob([createTestPng()], { type: 'image/png' });
  const png2 = new Blob([createTestPng()], { type: 'image/png' });
  form.append('images', png1, 'test-image-1.png');
  form.append('images', png2, 'test-image-2.png');

  info('Sending POST /api/tasks with 2 image files...');
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${USER_TOKEN}` },
    body: form,
  });

  const data = await res.json();

  if (res.status === 201 && data.task?.images?.length > 0) {
    ok(`Task created! ID: ${data.task._id}`);
    ok(`Images uploaded: ${data.task.images.length}`);
    data.task.images.forEach((img, i) => {
      info(`  Image ${i + 1}: ${img.url}`);
      info(`  PublicId: ${img.publicId}`);
    });
    return data.task._id;
  } else {
    fail(`Create task failed (${res.status})`);
    console.log(JSON.stringify(data, null, 2));
    return null;
  }
}

// ──── test: update task with new images ────

async function testUpdateTaskWithImages(taskId) {
  console.log('\n━━━ TEST 2: Update Task — Replace Images ━━━');
  if (!taskId) {
    fail('Skipped — no task ID from test 1');
    return;
  }

  const form = new FormData();
  form.append('title', 'Updated Upload Test Task');
  const png = new Blob([createTestPng()], { type: 'image/png' });
  form.append('images', png, 'updated-image.png');

  info(`Sending PUT /api/tasks/${taskId} with 1 new image...`);
  const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${USER_TOKEN}` },
    body: form,
  });

  const data = await res.json();

  if (res.status === 200) {
    ok(`Task updated!`);
    ok(`Images now: ${data.task?.images?.length}`);
    data.task?.images?.forEach((img, i) => {
      info(`  Image ${i + 1}: ${img.url}`);
    });
  } else {
    fail(`Update task failed (${res.status})`);
    console.log(JSON.stringify(data, null, 2));
  }
}

// ──── test: file too large (should fail) ────

async function testFileSizeLimit() {
  console.log('\n━━━ TEST 3: File Size Limit (expect 400) ━━━');

  const form = new FormData();
  form.append('title', 'Should Fail — Huge File');
  form.append('description', 'Testing file size rejection');
  form.append('mainCategory', 'fake');
  form.append('categories', JSON.stringify(['fake']));
  form.append('budget', '1000');
  form.append('location', JSON.stringify({ latitude: 0, longitude: 0 }));

  // Create a 21 MB buffer (over the 20 MB limit)
  const hugeBuffer = Buffer.alloc(21 * 1024 * 1024, 0xff);
  const hugeBlob = new Blob([hugeBuffer], { type: 'image/png' });
  form.append('images', hugeBlob, 'too-large.png');

  info('Sending a 21 MB file (should be rejected)...');
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${USER_TOKEN}` },
    body: form,
  });

  const data = await res.json();

  if (res.status === 400 && data.message?.includes('File too large')) {
    ok(`Correctly rejected: "${data.message}"`);
  } else {
    fail(`Expected 400, got ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
  }
}

// ──── test: invalid file type (should fail) ────

async function testInvalidFileType() {
  console.log('\n━━━ TEST 4: Invalid File Type (expect 400) ━━━');

  const form = new FormData();
  form.append('title', 'Should Fail — Bad Type');
  form.append('description', 'Testing mime type rejection');
  form.append('mainCategory', 'fake');
  form.append('categories', JSON.stringify(['fake']));
  form.append('budget', '1000');
  form.append('location', JSON.stringify({ latitude: 0, longitude: 0 }));

  const textBlob = new Blob(['not an image'], { type: 'text/plain' });
  form.append('images', textBlob, 'bad-file.txt');

  info('Sending a .txt file as image (should be rejected)...');
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${USER_TOKEN}` },
    body: form,
  });

  const data = await res.json();

  if (res.status === 400 && data.message?.includes('Invalid file type')) {
    ok(`Correctly rejected: "${data.message}"`);
  } else {
    fail(`Expected 400, got ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
  }
}

// ──── test: chat attachment upload ────

async function testChatAttachment() {
  console.log('\n━━━ TEST 5: Chat Message with Attachments ━━━');

  // We need a conversation ID. Try to list existing ones.
  info('Listing conversations...');
  const convRes = await fetch(`${BASE_URL}/chat/conversations`, {
    headers: { Authorization: `Bearer ${USER_TOKEN}` },
  });
  const convData = await convRes.json();
  const conversations = convData.conversations || convData.data || [];

  if (!conversations.length) {
    info('No conversations found — skipping chat test (need an active conversation).');
    info('To test chat: create a conversation first, then rerun.');
    return;
  }

  const convoId = conversations[0]._id || conversations[0].id;
  info(`Using conversation: ${convoId}`);

  const form = new FormData();
  form.append('text', 'Test message with file attachments');

  const png = new Blob([createTestPng()], { type: 'image/png' });
  const pdf = new Blob([createTestPdf()], { type: 'application/pdf' });
  form.append('attachments', png, 'photo.png');
  form.append('attachments', pdf, 'document.pdf');

  info('Sending message with 1 image + 1 PDF...');
  const res = await fetch(`${BASE_URL}/chat/conversations/${convoId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${USER_TOKEN}` },
    body: form,
  });

  const data = await res.json();

  if (res.status === 201 && data.message?.attachments?.length > 0) {
    ok(`Message sent! Attachments: ${data.message.attachments.length}`);
    data.message.attachments.forEach((att, i) => {
      info(`  ${i + 1}. ${att.name} (${att.type}, ${att.size} bytes)`);
      info(`     URL: ${att.url}`);
    });
  } else {
    fail(`Send message failed (${res.status})`);
    console.log(JSON.stringify(data, null, 2));
  }
}

// ──── run all ────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Media Upload Integration Tests       ║');
  console.log('╚══════════════════════════════════════════╝');

  await ensureToken();

  const taskId = await testCreateTaskWithImages();
  await testUpdateTaskWithImages(taskId);
  await testFileSizeLimit();
  await testInvalidFileType();
  await testChatAttachment();

  console.log('\n─── Done ───');
}

main().catch((err) => {
  fail(`Unhandled error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
