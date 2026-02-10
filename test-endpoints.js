import axios from 'axios';

const BASE_URL = 'http://localhost:3009/api';

// Test data
let userToken = null;
let taskerToken = null;
let userId = null;
let taskerId = null;
let taskId = null;
let categoryId = null;
let bidId = null;
let conversationId = null;
let adminToken = null;

const testUser = {
  fullName: 'Test User',
  emailAddress: `testuser${Date.now()}@example.com`,
  phoneNumber: '+1234567890',
  password: 'TestPassword123!',
  country: 'United States',
  residentState: 'California',
  originState: 'Texas',
  address: '123 Main Street, Los Angeles, CA',
  dateOfBirth: '1990-05-15'
};

const testTasker = {
  fullName: 'Test Tasker',
  emailAddress: `testtasker${Date.now()}@example.com`,
  phoneNumber: '+0987654321',
  password: 'TestPassword123!',
  country: 'United States',
  residentState: 'New York',
  originState: 'New York',
  address: '456 Main Street, New York, NY',
  dateOfBirth: '1995-03-20',
  skills: ['plumbing', 'electrical'],
  serviceRadius: 50
};

const testAdmin = {
  email: `testadmin${Date.now()}@example.com`,
  password: 'AdminPassword123!',
  fullName: 'Test Admin'
};

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function test(name, fn) {
  try {
    log(`\n🧪 Testing: ${name}`, 'blue');
    await fn();
    log(`✅ ${name} - PASSED`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${name} - FAILED`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'yellow');
      log(`   Message: ${JSON.stringify(error.response.data)}`, 'yellow');
    } else {
      log(`   Error: ${error.message}`, 'yellow');
    }
    return false;
  }
}

async function runTests() {
  let passCount = 0;
  let failCount = 0;

  log('\n' + '='.repeat(60), 'blue');
  log('TaskHub API Endpoint Tests', 'blue');
  log('='.repeat(60), 'blue');

  // ==================== AUTH ENDPOINTS ====================
  log('\n📌 AUTH ENDPOINTS TESTS', 'blue');
  log('-'.repeat(60), 'blue');

  // User Registration
  if (await test('User Registration', async () => {
    const response = await axios.post(`${BASE_URL}/auth/user-register`, testUser);
    if (response.status === 201) {
      userId = response.data.user._id;
      testUser._id = userId;
    }
  })) passCount++; else failCount++;

  // Tasker Registration
  if (await test('Tasker Registration', async () => {
    const response = await axios.post(`${BASE_URL}/auth/tasker-register`, testTasker);
    if (response.status === 201) {
      taskerId = response.data.user._id;
      testTasker._id = taskerId;
    }
  })) passCount++; else failCount++;

  // User Login
  if (await test('User Login', async () => {
    const response = await axios.post(`${BASE_URL}/auth/user-login`, {
      emailAddress: testUser.emailAddress,
      password: testUser.password
    });
    userToken = response.data.token;
  })) passCount++; else failCount++;

  // Tasker Login
  if (await test('Tasker Login', async () => {
    const response = await axios.post(`${BASE_URL}/auth/tasker-login`, {
      emailAddress: testTasker.emailAddress,
      password: testTasker.password
    });
    taskerToken = response.data.token;
  })) passCount++; else failCount++;

  // Email Verification
  if (await test('Verify Email (User)', async () => {
    const response = await axios.post(`${BASE_URL}/auth/verify-email`, {
      code: '12345', // Mock code
      emailAddress: testUser.emailAddress,
      type: 'user'
    });
  })) passCount++; else failCount++;

  // Resend Email Verification
  if (await test('Resend Email Verification', async () => {
    const response = await axios.post(`${BASE_URL}/auth/resend-verification`, {
      emailAddress: testUser.emailAddress,
      type: 'user'
    });
  })) passCount++; else failCount++;

  // Forgot Password
  if (await test('Forgot Password', async () => {
    const response = await axios.post(`${BASE_URL}/auth/forgot-password`, {
      emailAddress: testUser.emailAddress,
      type: 'user'
    });
  })) passCount++; else failCount++;

  // ==================== CATEGORY ENDPOINTS ====================
  log('\n📌 CATEGORY ENDPOINTS TESTS', 'blue');
  log('-'.repeat(60), 'blue');

  // Get All Categories
  if (await test('Get All Categories', async () => {
    const response = await axios.get(`${BASE_URL}/categories`);
    if (response.data.categories && response.data.categories.length > 0) {
      categoryId = response.data.categories[0]._id;
    }
  })) passCount++; else failCount++;

  // Get Category by ID
  if (categoryId && await test('Get Category by ID', async () => {
    const response = await axios.get(`${BASE_URL}/categories/${categoryId}`);
  })) passCount++; else failCount++;

  // ==================== TASK ENDPOINTS ====================
  log('\n📌 TASK ENDPOINTS TESTS', 'blue');
  log('-'.repeat(60), 'blue');

  const testTask = {
    title: 'Test Task',
    description: 'This is a test task description',
    categories: [categoryId || '507f1f77bcf86cd799439011'],
    location: {
      latitude: 40.7128,
      longitude: -74.0060
    },
    budget: 100,
    isBiddingEnabled: true,
    tags: ['test']
  };

  // Create Task
  if (await test('Create Task', async () => {
    const response = await axios.post(`${BASE_URL}/tasks`, testTask, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    taskId = response.data.task._id;
  })) passCount++; else failCount++;

  // Get All Tasks
  if (await test('Get All Tasks', async () => {
    const response = await axios.get(`${BASE_URL}/tasks`);
  })) passCount++; else failCount++;

  // Get Task by ID
  if (taskId && await test('Get Task by ID', async () => {
    const response = await axios.get(`${BASE_URL}/tasks/${taskId}`);
  })) passCount++; else failCount++;

  // Update Task
  if (taskId && await test('Update Task', async () => {
    const response = await axios.put(`${BASE_URL}/tasks/${taskId}`, {
      title: 'Updated Test Task',
      description: 'Updated description'
    }, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // Get Tasks by Category
  if (categoryId && await test('Get Tasks by Category', async () => {
    const response = await axios.get(`${BASE_URL}/tasks/category/${categoryId}`);
  })) passCount++; else failCount++;

  // Get Tasks by Location
  if (await test('Get Tasks by Location', async () => {
    const response = await axios.get(`${BASE_URL}/tasks/location`, {
      params: {
        latitude: 40.7128,
        longitude: -74.0060,
        radius: 50
      }
    });
  })) passCount++; else failCount++;

  // ==================== BID ENDPOINTS ====================
  log('\n📌 BID ENDPOINTS TESTS', 'blue');
  log('-'.repeat(60), 'blue');

  const testBid = {
    amount: 75,
    description: 'I can complete this task'
  };

  // Create Bid
  if (taskId && await test('Create Bid', async () => {
    const response = await axios.post(`${BASE_URL}/bids`, {
      taskId,
      ...testBid
    }, {
      headers: { Authorization: `Bearer ${taskerToken}` }
    });
    bidId = response.data.bid._id;
  })) passCount++; else failCount++;

  // Get All Bids
  if (await test('Get All Bids', async () => {
    const response = await axios.get(`${BASE_URL}/bids`);
  })) passCount++; else failCount++;

  // Get Bid by ID
  if (bidId && await test('Get Bid by ID', async () => {
    const response = await axios.get(`${BASE_URL}/bids/${bidId}`);
  })) passCount++; else failCount++;

  // Get Bids for Task
  if (taskId && await test('Get Bids for Task', async () => {
    const response = await axios.get(`${BASE_URL}/bids/task/${taskId}`);
  })) passCount++; else failCount++;

  // Accept Bid
  if (bidId && await test('Accept Bid', async () => {
    const response = await axios.put(`${BASE_URL}/bids/${bidId}/accept`, {}, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // ==================== CHAT ENDPOINTS ====================
  log('\n📌 CHAT ENDPOINTS TESTS', 'blue');
  log('-'.repeat(60), 'blue');

  // Create Conversation
  if (taskId && await test('Create Conversation', async () => {
    const response = await axios.post(`${BASE_URL}/chat/conversations`, {
      taskId,
      participantId: taskerId
    }, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    conversationId = response.data.conversation._id;
  })) passCount++; else failCount++;

  // Get User Conversations
  if (await test('Get User Conversations', async () => {
    const response = await axios.get(`${BASE_URL}/chat/conversations`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // Get Conversation by ID
  if (conversationId && await test('Get Conversation by ID', async () => {
    const response = await axios.get(`${BASE_URL}/chat/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // Send Message
  if (conversationId && await test('Send Message', async () => {
    const response = await axios.post(`${BASE_URL}/chat/messages`, {
      conversationId,
      content: 'Test message'
    }, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // Get Messages for Conversation
  if (conversationId && await test('Get Messages for Conversation', async () => {
    const response = await axios.get(`${BASE_URL}/chat/messages/${conversationId}`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // ==================== USER ENDPOINTS ====================
  log('\n📌 USER ENDPOINTS TESTS', 'blue');
  log('-'.repeat(60), 'blue');

  // Get User Profile
  if (await test('Get User Profile', async () => {
    const response = await axios.get(`${BASE_URL}/auth/profile`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // Update User Profile
  if (await test('Update User Profile', async () => {
    const response = await axios.put(`${BASE_URL}/auth/profile`, {
      fullName: 'Updated Name'
    }, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // Get User Tasks
  if (await test('Get User Tasks', async () => {
    const response = await axios.get(`${BASE_URL}/auth/my-tasks`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
  })) passCount++; else failCount++;

  // ==================== TASKER ENDPOINTS ====================
  log('\n📌 TASKER ENDPOINTS TESTS', 'blue');
  log('-'.repeat(60), 'blue');

  // Get Tasker Profile
  if (await test('Get Tasker Profile', async () => {
    const response = await axios.get(`${BASE_URL}/auth/tasker-profile`, {
      headers: { Authorization: `Bearer ${taskerToken}` }
    });
  })) passCount++; else failCount++;

  // Update Tasker Profile
  if (await test('Update Tasker Profile', async () => {
    const response = await axios.put(`${BASE_URL}/auth/tasker-profile`, {
      fullName: 'Updated Tasker Name'
    }, {
      headers: { Authorization: `Bearer ${taskerToken}` }
    });
  })) passCount++; else failCount++;

  // Get Tasker Bids
  if (await test('Get Tasker Bids', async () => {
    const response = await axios.get(`${BASE_URL}/auth/my-bids`, {
      headers: { Authorization: `Bearer ${taskerToken}` }
    });
  })) passCount++; else failCount++;

  // ==================== ADMIN ENDPOINTS ====================
  log('\n📌 ADMIN ENDPOINTS TESTS', 'blue');
  log('-'.repeat(60), 'blue');

  // Admin Login (might fail if not registered, that's ok)
  if (await test('Admin Login', async () => {
    const response = await axios.post(`${BASE_URL}/admin/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    adminToken = response.data.token;
  })) passCount++; else failCount++;

  // Get Dashboard Stats (if admin token exists)
  if (adminToken && await test('Get Dashboard Stats', async () => {
    const response = await axios.get(`${BASE_URL}/admin/dashboard/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  })) passCount++; else failCount++;

  // ==================== SUMMARY ====================
  log('\n' + '='.repeat(60), 'blue');
  log(`📊 TEST SUMMARY`, 'blue');
  log('='.repeat(60), 'blue');
  log(`✅ Passed: ${passCount}`, 'green');
  log(`❌ Failed: ${failCount}`, failCount > 0 ? 'red' : 'green');
  log(`📈 Total: ${passCount + failCount}`, 'blue');
  log(`🎯 Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(2)}%`, 
    passCount / (passCount + failCount) >= 0.8 ? 'green' : 'yellow');
  log('='.repeat(60), 'blue');

  process.exit(failCount > 0 ? 1 : 0);
}

// Check if server is running before starting tests
async function checkServer() {
  try {
    await axios.get('http://localhost:3009');
    return true;
  } catch (error) {
    return false;
  }
}

(async () => {
  log('\n🔍 Checking if server is running...', 'yellow');
  if (await checkServer()) {
    log('✅ Server is running!\n', 'green');
    await runTests();
  } else {
    log('❌ Server is not running on http://localhost:3009', 'red');
    log('Please start the server first with: npm start', 'yellow');
    process.exit(1);
  }
})();
