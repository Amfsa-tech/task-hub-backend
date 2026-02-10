# Tasker API Endpoints Documentation

This document covers all API endpoints specifically for taskers in the TaskHub application.

## Table of Contents

1. [Authentication](#authentication)
2. [Profile Management](#profile-management)
3. [Categories Management](#categories-management)
4. [Task Management](#task-management)
5. [Account Management](#account-management)
6. [Code Examples](#code-examples)
7. [Error Handling](#error-handling)
8. [Bidding System](#bidding-system)

---

## Authentication

### 1. Tasker Registration

**Endpoint:** `POST /api/auth/tasker-register`

**Description:** Register a new tasker account

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "emailAddress": "jane.smith@example.com",
  "phoneNumber": "+1234567891",
  "password": "securePassword123",
  "country": "United States",
  "residentState": "California",
  "originState": "Texas",
  "address": "456 Oak Avenue, San Francisco, CA",
  "dateOfBirth": "1992-03-20"
}
```

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Tasker registered successfully. Please verify your email.",
  "user": {
    "_id": "60d0fe4f5311236168a109cb",
    "firstName": "Jane",
    "lastName": "Smith",
    "emailAddress": "jane.smith@example.com",
    "phoneNumber": "+1234567891",
    "wallet": 0,
    "categories": [],
    "isEmailVerified": false,
    "verifyIdentity": false,
    "createdAt": "2023-12-02T14:30:00.000Z"
  }
}
```

**Error Responses:**
- `400` - Missing required fields
- `400` - Email or phone number already exists
- `400` - Password too short (minimum 6 characters)
- `500` - Server error

### 2. Tasker Login

**Endpoint:** `POST /api/auth/tasker-login`

**Description:** Login as a tasker

**Request Body:**
```json
{
  "emailAddress": "jane.smith@example.com",
  "password": "securePassword123"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "60d0fe4f5311236168a109cb",
    "firstName": "Jane",
    "lastName": "Smith",
    "emailAddress": "jane.smith@example.com",
    "categories": ["home-cleaning", "gardening"],
    "isEmailVerified": true,
    "verifyIdentity": false
  }
}
```

**Error Responses:**
- `400` - Missing email or password
- `400` - Invalid credentials
- `400` - Account temporarily locked
- `403` - Account not verified
- `500` - Server error

---

## Profile Management

### 3. Get Tasker Profile

**Endpoint:** `GET /api/auth/tasker`

**Description:** Get current tasker's profile information. The response includes populated categories with full details (name, displayName, description, isActive status).

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Tasker fetched successfully",
  "user": {
    "_id": "60d0fe4f5311236168a109cb",
    "firstName": "Jane",
    "lastName": "Smith",
    "emailAddress": "jane.smith@example.com",
    "phoneNumber": "+1234567891",
    "dateOfBirth": "1992-03-20T00:00:00.000Z",
    "profilePicture": "",
    "country": "United States",
    "originState": "Texas",
    "residentState": "California",
    "address": "456 Oak Avenue, San Francisco, CA",
    "wallet": 150,
    "categories": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "plumbing-repair",
        "displayName": "Plumbing Repair",
        "description": "Professional plumbing services including pipe repairs, fixture installation, and leak detection",
        "isActive": true
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "name": "home-cleaning",
        "displayName": "Home Cleaning",
        "description": "Professional residential cleaning services",
        "isActive": true
      }
    ],
    "isEmailVerified": true,
    "verifyIdentity": false,
    "lastLogin": "2023-12-07T09:15:00.000Z",
    "createdAt": "2023-12-02T14:30:00.000Z"
  }
}
```

### 4. Update Tasker Profile

**Endpoint:** `PUT /api/auth/profile`

**Description:** Update tasker profile information

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body (any combination of allowed fields):**
```json
{
  "firstName": "Jane",
  "lastName": "Updated Smith",
  "phoneNumber": "+1987654321",
  "country": "Canada",
  "residentState": "Ontario",
  "address": "789 New Street, Toronto, ON",
  "profilePicture": "https://example.com/profile.jpg",
  "categories": ["home-cleaning", "gardening", "plumbing"]
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Profile updated successfully",
  "user": {
    // Updated tasker object
  }
}
```

**Error Responses:**
- `400` - No valid fields to update
- `400` - Phone number already in use
- `400` - Categories must be an array of strings
- `401` - Invalid or expired token
- `500` - Server error

---

## Categories Management

### 5. Get All Categories (Public)

**Endpoint:** `GET /api/categories`

**Description:** Get all active categories available for selection. This is a public endpoint that doesn't require authentication and is used to populate category selection dropdowns.

**Success Response (200):**
```json
{
  "status": "success",
  "count": 4,
  "categories": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "plumbing-repair",
      "displayName": "Plumbing Repair",
      "description": "Professional plumbing services including pipe repairs, fixture installation, and leak detection"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "electrical-work",
      "displayName": "Electrical Work",
      "description": "Electrical installations and repairs for residential and commercial properties"
    },
    {
      "_id": "507f1f77bcf86cd799439017",
      "name": "handyman",
      "displayName": "General Handyman",
      "description": "General maintenance and repair services"
    },
    {
      "_id": "507f1f77bcf86cd799439018",
      "name": "painting",
      "displayName": "Painting Services",
      "description": "Interior and exterior painting services"
    }
  ]
}
```

**Error Responses:**
- `500` - Server error

**Usage Examples:**
```bash
# Get all available categories
curl -X GET http://localhost:3009/api/categories
```

```javascript
// Fetch categories for dropdown
const fetchCategories = async () => {
  const response = await fetch('/api/categories');
  const data = await response.json();
  return data.categories;
};
```

### 6. Get Category by ID (Public)

**Endpoint:** `GET /api/categories/:id`

**Description:** Get details of a specific category by its ID. This is a public endpoint.

**Parameters:**
- `id` - Category ObjectId

**Success Response (200):**
```json
{
  "status": "success",
  "category": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "plumbing-repair",
    "displayName": "Plumbing Repair",
    "description": "Professional plumbing services including pipe repairs, fixture installation, and leak detection",
    "isActive": true,
    "createdAt": "2023-12-01T10:00:00.000Z",
    "createdBy": {
      "_id": "60d0fe4f5311236168a109ca",
      "fullName": "Admin User",
      "emailAddress": "admin@taskhub.com"
    }
  }
}
```

**Error Responses:**
- `400` - Invalid category ID format
- `404` - Category not found
- `500` - Server error

### 7. Update Tasker Categories

**Endpoint:** `PUT /api/auth/categories`

**Description:** Update categories that a tasker can handle (taskers only). Categories must be selected from admin-created categories using their ObjectId values.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "categories": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"]
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Categories updated successfully",
  "categories": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "plumbing-repair",
      "displayName": "Plumbing Repair",
      "description": "Professional plumbing services"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "electrical-work",
      "displayName": "Electrical Work",
      "description": "Electrical installations and repairs"
    }
  ]
}
```

**Error Responses:**
- `400` - Categories array is required
- `400` - Categories must be an array of category IDs
- `400` - All categories must be valid ObjectId strings
- `400` - Some categories are invalid or inactive
- `400` - At least one valid category is required
- `403` - This endpoint is only available for taskers
- `401` - Invalid or expired token
- `500` - Server error

**Note:** Use the public endpoint `GET /api/categories` to get all available categories for selection.

---

## Task Management

### 8. Get Tasker Feed

**Endpoint:** `GET /api/tasks/tasker/feed`

**Description:** Get a personalized feed of tasks that match the tasker's categories. Only shows open tasks that are available for applications. Includes bidding information and application guidance for both bidding-enabled and fixed-price tasks.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `page` (optional) - Page number for pagination (default: 1)
- `limit` (optional) - Number of tasks per page (default: 10)
- `biddingOnly` (optional) - Show only tasks with bidding enabled (true/false)
- `budget_min` (optional) - Minimum budget filter (number)
- `budget_max` (optional) - Maximum budget filter (number)
- `maxDistance` (optional) - Maximum distance in miles (default: 200, requires tasker location)

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Tasker feed retrieved successfully",
  "tasks": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Home Cleaning Service",
      "description": "Need weekly cleaning service for 3-bedroom house",
      "budget": 150,
      "isBiddingEnabled": true,
      "status": "open",
      "location": {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "address": "New York, NY"
      },
      "categories": [
        {
          "_id": "507f1f77bcf86cd799439012",
          "name": "home-cleaning",
          "displayName": "Home Cleaning"
        }
      ],
      "user": {
        "_id": "60d0fe4f5311236168a109ca",
        "fullName": "John Doe",
        "profilePicture": ""
      },
      "createdAt": "2023-12-06T10:00:00.000Z",
      "taskerBidInfo": {
        "hasBid": false
        // If hasBid is true, includes: amount, bidType
      },
      "applicationInfo": {
        "canApply": true,
        "applicationMode": "bidding", // or "fixed"
        "applicationLabel": "Place Bid", // or "Apply for Task"
        "priceEditable": true, // or false for fixed-price tasks
        "fixedPrice": null // or budget amount for fixed-price tasks
      }
    },
    {
      "_id": "507f1f77bcf86cd799439013",
      "title": "Furniture Assembly",
      "description": "Need help assembling IKEA furniture",
      "budget": 75,
      "isBiddingEnabled": false,
      "status": "open",
      "categories": [
        {
          "_id": "507f1f77bcf86cd799439014",
          "name": "furniture-assembly",
          "displayName": "Furniture Assembly"
        }
      ],
      "user": {
        "_id": "60d0fe4f5311236168a109cb",
        "fullName": "Jane Smith",
        "profilePicture": ""
      },
      "createdAt": "2023-12-07T09:00:00.000Z",
      "taskerBidInfo": {
        "hasBid": true,
        "amount": 75,
        "bidType": "fixed"
      },
      "applicationInfo": {
        "canApply": false,
        "applicationMode": "fixed",
        "applicationLabel": "Apply for Task",
        "priceEditable": false,
        "fixedPrice": 75
      }
    }
  ],
  "taskerCategories": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "home-cleaning",
      "displayName": "Home Cleaning"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalTasks": 42,
    "hasNextPage": true,
    "hasPrevPage": false,
    "tasksPerPage": 10
  },
  "filters": {
    "appliedFilters": {
      "categories": ["507f1f77bcf86cd799439012"],
      "status": "open"
    },
    "availableFilters": {
      "biddingOnly": "Show only tasks with bidding enabled",
      "budget_min": "Minimum budget filter",
      "budget_max": "Maximum budget filter",
      "maxDistance": "Maximum distance in miles (default: 200, requires tasker location)"
    }
  }
}
```

**Key Response Fields:**

- **`taskerBidInfo`**: Shows if you've already applied and your bid details
  - `hasBid`: Boolean indicating if you've applied
  - `amount`: Your bid amount (if you've applied)
  - `bidType`: "custom" or "fixed" (if you've applied)

- **`applicationInfo`**: Guides client-side UI behavior
  - `canApply`: Whether you can apply (false if already applied)
  - `applicationMode`: "bidding" or "fixed" 
  - `applicationLabel`: Suggested button text
  - `priceEditable`: Whether to show price input field
  - `fixedPrice`: Fixed amount for non-bidding tasks

**Error Responses:**
- `401` - Invalid or expired token
- `403` - This endpoint is only available for taskers
- `404` - Tasker not found
- `500` - Server error

**Usage Examples:**

*Basic feed request:*
```bash
curl -X GET "http://localhost:3009/api/tasks/tasker/feed" \
  -H "Authorization: Bearer {accessToken}"
```

*Filtered feed request:*
```bash
curl -X GET "http://localhost:3009/api/tasks/tasker/feed?biddingOnly=true&budget_min=100&maxDistance=50" \
  -H "Authorization: Bearer {accessToken}"
```

### 9. Update Tasker Location

**Endpoint:** `PUT /api/auth/location`

**Description:** Update the tasker's current location coordinates. This is used for distance-based task filtering in the feed. Can be called periodically (e.g., every few minutes) to keep location current.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Location updated successfully",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "lastUpdated": "2023-12-07T15:30:00.000Z"
  }
}
```

**Error Responses:**
- `400` - Missing latitude or longitude
- `400` - Invalid coordinate format (must be numbers)
- `400` - Latitude out of range (-90 to 90)
- `400` - Longitude out of range (-180 to 180)
- `401` - Invalid or expired token
- `403` - This endpoint is only available for taskers
- `500` - Server error

**Location Usage Examples:**
```javascript
// Update location every 5 minutes while app is active
setInterval(async () => {
  if (navigator.geolocation && isAppActive) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      await updateTaskerLocation(
        position.coords.latitude,
        position.coords.longitude
      );
    });
  }
}, 5 * 60 * 1000); // 5 minutes
```

---

## Account Management

### 10. Change Password

**Endpoint:** `POST /api/auth/change-password`

**Description:** Change tasker password (requires current password)

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword456"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Password changed successfully"
}
```

### 11. Update Profile Picture

**Endpoint:** `PUT /api/auth/profile-picture`

**Description:** Update tasker profile picture

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "profilePicture": "https://example.com/images/new-profile.jpg"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Profile picture updated successfully",
  "profilePicture": "https://example.com/images/new-profile.jpg"
}
```

### 12. Logout

**Endpoint:** `POST /api/auth/logout`

**Description:** Logout tasker (client should discard the token)

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

### 13. Deactivate Account

**Endpoint:** `POST /api/auth/deactivate-account`

**Description:** Deactivate tasker account (requires password confirmation)

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "password": "currentPassword123"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Account deactivated successfully"
}
```

---

## Bidding System

### 14. Create Bid/Application

**Endpoint:** `POST /api/bids`

**Description:** Apply for a task by placing a bid. The system automatically handles both bidding-enabled and bidding-disabled tasks through a unified interface.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**

*For Bidding-Enabled Tasks:*
```json
{
  "taskId": "507f1f77bcf86cd799439011",
  "amount": 150,
  "message": "I can complete this task efficiently with 5 years of experience"
}
```

*For Bidding-Disabled Tasks (Fixed Price):*
```json
{
  "taskId": "507f1f77bcf86cd799439012",
  "message": "I'm available to help with this task and can start immediately"
}
```

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Bid placed successfully", // or "Application submitted successfully"
  "bid": {
    "_id": "507f1f77bcf86cd799439013",
    "task": "507f1f77bcf86cd799439011",
    "tasker": "60d0fe4f5311236168a109cb",
    "amount": 150,
    "message": "I can complete this task efficiently",
    "bidType": "custom", // or "fixed" for non-bidding tasks
    "status": "pending",
    "createdAt": "2023-12-07T10:00:00.000Z",
    "taskBiddingEnabled": true
  }
}
```

**Error Responses:**
- `400` - Missing required fields (taskId always required, amount required for bidding tasks)
- `400` - Invalid task ID format
- `400` - Invalid amount value (must be positive number)
- `400` - Task not found
- `400` - Task is not open for applications
- `400` - Cannot apply for your own task
- `400` - You have already applied for this task
- `401` - Invalid or expired token
- `500` - Server error

### 15. Update Bid/Application

**Endpoint:** `PUT /api/bids/:id`

**Description:** Update an existing bid or application. For fixed-price applications, only the message can be updated.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "amount": 175, // Only for custom bids (bidding-enabled tasks)
  "message": "Updated message with more details about my approach"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Application updated successfully",
  "bid": {
    "_id": "507f1f77bcf86cd799439013",
    "task": "507f1f77bcf86cd799439011",
    "tasker": "60d0fe4f5311236168a109cb",
    "amount": 175,
    "message": "Updated message",
    "bidType": "custom",
    "status": "pending",
    "createdAt": "2023-12-07T10:00:00.000Z"
  }
}
```

**Error Responses:**
- `400` - Invalid bid ID format
- `400` - Invalid amount value
- `400` - Cannot update amount for fixed-price applications
- `400` - Cannot update a bid that is not pending
- `400` - Cannot update bid for a task that is not open
- `403` - You are not authorized to update this bid
- `404` - Bid not found
- `401` - Invalid or expired token
- `500` - Server error

### 16. Delete Bid/Application

**Endpoint:** `DELETE /api/bids/:id`

**Description:** Delete a pending bid or application

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Bid deleted successfully"
}
```

**Error Responses:**
- `400` - Invalid bid ID format
- `400` - Cannot delete a bid that is not pending
- `403` - You are not authorized to delete this bid
- `404` - Bid not found
- `401` - Invalid or expired token
- `500` - Server error

### 17. Get My Bids/Applications

**Endpoint:** `GET /api/bids/tasker`

**Description:** Get all bids and applications placed by the current tasker

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `page` (optional) - Page number for pagination (default: 1)
- `limit` (optional) - Number of bids per page (default: 10)
- `status` (optional) - Filter by status: 'pending', 'accepted', 'rejected'

**Success Response (200):**
```json
{
  "status": "success",
  "count": 15,
  "totalBids": 25,
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "bids": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "task": {
        "_id": "507f1f77bcf86cd799439011",
        "title": "Home Cleaning Service",
        "description": "Need weekly cleaning",
        "budget": 100,
        "status": "open",
        "createdAt": "2023-12-06T10:00:00.000Z"
      },
      "amount": 150,
      "message": "I can help with this",
      "bidType": "custom",
      "status": "pending",
      "createdAt": "2023-12-07T10:00:00.000Z"
    }
  ]
}
```

### 18. Get Bid Details

**Endpoint:** `GET /api/bids/:id`

**Description:** Get details of a specific bid (only if you own the bid)

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Success Response (200):**
```json
{
  "status": "success",
  "bid": {
    "_id": "507f1f77bcf86cd799439013",
    "task": {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Home Cleaning Service",
      "description": "Need weekly cleaning service",
      "budget": 100,
      "status": "open",
      "user": {
        "_id": "60d0fe4f5311236168a109ca",
        "fullName": "John Doe",
        "profilePicture": ""
      }
    },
    "amount": 150,
    "message": "I can complete this efficiently",
    "bidType": "custom",
    "status": "pending",
    "createdAt": "2023-12-07T10:00:00.000Z"
  }
}
```

---

## Code Examples

### cURL Examples

#### Tasker Registration
```bash
curl -X POST http://localhost:3009/api/auth/tasker-register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "emailAddress": "jane@example.com",
    "phoneNumber": "+1234567891",
    "password": "password123",
    "country": "United States",
    "residentState": "CA",
    "originState": "TX",
    "address": "456 Oak Ave",
    "dateOfBirth": "1992-03-20"
  }'
```

#### Tasker Login
```bash
curl -X POST http://localhost:3009/api/auth/tasker-login \
  -H "Content-Type: application/json" \
  -d '{
    "emailAddress": "jane@example.com",
    "password": "password123"
  }'
```

#### Get Tasker Profile
```bash
curl -X GET http://localhost:3009/api/auth/tasker \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Update Tasker Categories
```bash
curl -X PUT http://localhost:3009/api/auth/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "categories": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
  }'
```

#### Get Available Categories (Public)
```bash
curl -X GET http://localhost:3009/api/categories
```

#### Get Category by ID (Public)
```bash
curl -X GET http://localhost:3009/api/categories/507f1f77bcf86cd799439011
```

#### Update Tasker Profile
```bash
curl -X PUT http://localhost:3009/api/auth/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "firstName": "Updated Jane",
    "categories": ["home-cleaning", "plumbing"]
  }'
```

#### Get Tasker Feed
```bash
# Basic feed request
curl -X GET http://localhost:3009/api/tasks/tasker/feed \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# With filters and pagination
curl -X GET "http://localhost:3009/api/tasks/tasker/feed?page=1&limit=5&biddingOnly=true&budget_min=100&budget_max=500" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Update Tasker Location
```bash
curl -X PUT http://localhost:3009/api/auth/location \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "latitude": 40.7128,
    "longitude": -74.0060
  }'
```

### JavaScript Frontend Integration

#### Tasker Login and Token Management
```javascript
// Login function for taskers
const loginTasker = async (email, password) => {
  const response = await fetch('/api/auth/tasker-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailAddress: email, password })
  });
  
  if (response.ok) {
    const data = await response.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('userType', 'tasker');
    return data;
  }
  throw new Error('Login failed');
};

// Get tasker profile
const getTaskerProfile = async () => {
  const response = await makeAuthenticatedRequest('/api/auth/tasker', {
    method: 'GET'
  });
  
  if (response && response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to fetch profile');
};

// Update tasker categories
const updateTaskerCategories = async (categories) => {
  const response = await makeAuthenticatedRequest('/api/auth/categories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories })
  });
  
  if (response && response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to update categories');
};

// Update tasker profile
const updateTaskerProfile = async (profileData) => {
  const response = await makeAuthenticatedRequest('/api/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profileData)
  });
  
  if (response && response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to update profile');
};

// Get tasker feed
const getTaskerFeed = async (filters = {}) => {
  const params = new URLSearchParams();
  
  // Add pagination
  if (filters.page) params.append('page', filters.page);
  if (filters.limit) params.append('limit', filters.limit);
  
  // Add filters
  if (filters.biddingOnly) params.append('biddingOnly', filters.biddingOnly);
  if (filters.budget_min) params.append('budget_min', filters.budget_min);
  if (filters.budget_max) params.append('budget_max', filters.budget_max);
  
  const url = `/api/tasks/tasker/feed${params.toString() ? '?' + params.toString() : ''}`;
  const response = await makeAuthenticatedRequest(url, {
    method: 'GET'
  });
  
  if (response && response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to fetch tasker feed');
};

// Update tasker location
const updateTaskerLocation = async (latitude, longitude) => {
  const response = await makeAuthenticatedRequest('/api/auth/location', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude })
  });
  
  if (response && response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to update location');
};

// Authenticated request helper
const makeAuthenticatedRequest = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    window.location.href = '/login';
    return null;
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    window.location.href = '/login';
    return null;
  }
  
  return response;
};
```

### React Hook Example
```javascript
// Custom hook for tasker operations
import { useState, useEffect } from 'react';

const useTasker = () => {
  const [tasker, setTasker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTaskerProfile();
  }, []);

  const fetchTaskerProfile = async () => {
    try {
      setLoading(true);
      const data = await getTaskerProfile();
      setTasker(data.user);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateCategories = async (categories) => {
    try {
      const data = await updateTaskerCategories(categories);
      setTasker(prev => ({ ...prev, categories: data.categories }));
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const data = await updateTaskerProfile(profileData);
      setTasker(data.user);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return {
    tasker,
    loading,
    error,
    updateCategories,
    updateProfile,
    refetch: fetchTaskerProfile
  };
};

export default useTasker;
```

---

## Error Handling

### Common HTTP Status Codes

- **200** - Success
- **201** - Created (registration successful)
- **400** - Bad Request (validation errors, missing fields)
- **401** - Unauthorized (invalid/expired token, invalid credentials)
- **403** - Forbidden (email verification required, insufficient permissions)
- **500** - Internal Server Error

### Error Response Format

All error responses follow this format:

```json
{
  "status": "error",
  "message": "Descriptive error message"
}
```

### Specific Error Scenarios

#### Account Lockout
```json
{
  "status": "error",
  "message": "Account temporarily locked due to too many failed login attempts. Please try again later."
}
```

#### Email Verification Required
```json
{
  "status": "error",
  "message": "Email verification required. Please verify your email to access this feature.",
  "emailVerificationRequired": true
}
```

#### Invalid Categories Format
```json
{
  "status": "error",
  "message": "Categories must be an array of strings"
}
```

#### Tasker-Only Endpoint Access
```json
{
  "status": "error",
  "message": "This endpoint is only available for taskers"
}
```

---

## Tasker-Specific Features

### Categories System
- **Purpose**: Allows taskers to specify which types of tasks they can handle
- **Format**: Array of strings (e.g., ["home-cleaning", "gardening", "plumbing"])
- **Validation**: Removes duplicates and empty values automatically
- **Access**: Can be updated via profile update or dedicated categories endpoint

### Identity Verification
- **Field**: `verifyIdentity` (boolean)
- **Purpose**: Tracks whether a tasker has completed identity verification
- **Default**: `false`
- **Note**: This field is typically managed by administrators

### Wallet System
- **Field**: `wallet` (number)
- **Purpose**: Tracks tasker's earnings and balance
- **Default**: `0`
- **Currency**: Assumed to be in the system's base currency

---

## Security Considerations

1. **Always use HTTPS in production**
2. **Store JWT tokens securely** (httpOnly cookies recommended for web apps)
3. **Implement token refresh logic** for long-lived sessions
4. **Validate user permissions** before allowing category updates
5. **Rate limit authentication endpoints** to prevent brute force attacks
6. **Log security events** for monitoring and auditing

---

## Getting Started

1. **Register a tasker account** using the registration endpoint
2. **Verify email** using the email verification endpoint
3. **Login** to receive a JWT token
4. **Update profile** and set initial categories
5. **Use authenticated endpoints** with the Bearer token

For shared authentication features (email verification, password reset, etc.), refer to the main [API_AUTH_ENDPOINTS.md](./API_AUTH_ENDPOINTS.md) documentation. 