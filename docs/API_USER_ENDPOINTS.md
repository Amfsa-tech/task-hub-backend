# User API Endpoints Documentation

This document covers all API endpoints specifically for regular users in the TaskHub application.

## Table of Contents

1. [Authentication](#authentication)
2. [Profile Management](#profile-management)
3. [Bidding Management](#bidding-management)
4. [Account Management](#account-management)
5. [Code Examples](#code-examples)
6. [Error Handling](#error-handling)

---

## Authentication

### 1. User Registration

**Endpoint:** `POST /api/auth/user-register`

**Description:** Register a new user account

**Request Body:**
```json
{
  "fullName": "John Doe",
  "emailAddress": "john.doe@example.com",
  "phoneNumber": "+1234567890",
  "password": "securePassword123",
  "country": "United States",
  "residentState": "California",
  "originState": "Texas",
  "address": "123 Main Street, Los Angeles, CA",
  "dateOfBirth": "1990-05-15"
}
```

**Success Response (201):**
```json
{
  "status": "success",
  "message": "User registered successfully. Please verify your email.",
  "user": {
    "_id": "60d0fe4f5311236168a109ca",
    "fullName": "John Doe",
    "emailAddress": "john.doe@example.com",
    "phoneNumber": "+1234567890",
    "wallet": 0,
    "isEmailVerified": false,
    "createdAt": "2023-12-02T14:30:00.000Z"
  }
}
```

**Error Responses:**
- `400` - Missing required fields
- `400` - Email or phone number already exists
- `400` - Password too short (minimum 6 characters)
- `500` - Server error

### 2. User Login

**Endpoint:** `POST /api/auth/user-login`

**Description:** Login as a user

**Request Body:**
```json
{
  "emailAddress": "john.doe@example.com",
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
    "_id": "60d0fe4f5311236168a109ca",
    "fullName": "John Doe",
    "emailAddress": "john.doe@example.com",
    "isEmailVerified": true
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

### 3. Get User Profile

**Endpoint:** `GET /api/auth/user`

**Description:** Get current user's profile information

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "User fetched successfully",
  "user": {
    "_id": "60d0fe4f5311236168a109ca",
    "fullName": "John Doe",
    "emailAddress": "john.doe@example.com",
    "phoneNumber": "+1234567890",
    "dateOfBirth": "1990-05-15T00:00:00.000Z",
    "profilePicture": "",
    "country": "United States",
    "originState": "Texas",
    "residentState": "California", 
    "address": "123 Main Street, Los Angeles, CA",
    "wallet": 250,
    "isEmailVerified": true,
    "lastLogin": "2023-12-07T09:15:00.000Z",
    "createdAt": "2023-12-02T14:30:00.000Z"
  }
}
```

### 4. Update User Profile

**Endpoint:** `PUT /api/auth/profile`

**Description:** Update user profile information

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body (any combination of allowed fields):**
```json
{
  "fullName": "John Updated Doe",
  "phoneNumber": "+1987654321",
  "country": "Canada",
  "residentState": "Ontario",
  "address": "789 New Street, Toronto, ON",
  "profilePicture": "https://example.com/profile.jpg"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Profile updated successfully",
  "user": {
    // Updated user object
  }
}
```

**Error Responses:**
- `400` - No valid fields to update
- `400` - Phone number already in use
- `401` - Invalid or expired token
- `500` - Server error

---

## Bidding Management

### 5. Get Task Bids

**Endpoint:** `GET /api/bids/task/:taskId`

**Description:** Get all bids/applications for a specific task (task owner only). Shows both custom bids and fixed-price applications with clear labeling.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Success Response (200):**
```json
{
  "status": "success",
  "count": 3,
  "taskBiddingEnabled": true,
  "bids": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "task": "507f1f77bcf86cd799439011",
      "tasker": {
        "_id": "60d0fe4f5311236168a109cb",
        "firstName": "Jane",
        "lastName": "Smith",
        "profilePicture": "https://example.com/profile.jpg"
      },
      "amount": 150,
      "message": "I have 5 years of experience in home cleaning and can start immediately",
      "bidType": "custom",
      "status": "pending",
      "createdAt": "2023-12-07T10:00:00.000Z",
      "bidTypeLabel": "Custom Bid",
      "isFixedPrice": false
    },
    {
      "_id": "507f1f77bcf86cd799439014",
      "task": "507f1f77bcf86cd799439011",
      "tasker": {
        "_id": "60d0fe4f5311236168a109cc",
        "firstName": "Mike",
        "lastName": "Johnson",
        "profilePicture": ""
      },
      "amount": 100,
      "message": "Available this weekend and have all necessary equipment",
      "bidType": "fixed",
      "status": "pending",
      "createdAt": "2023-12-07T11:00:00.000Z",
      "bidTypeLabel": "Fixed Price Application",
      "isFixedPrice": true
    }
  ]
}
```

**Key Response Fields:**
- **`taskBiddingEnabled`**: Indicates if the task allows custom bidding
- **`bidType`**: "custom" for bidding-enabled tasks, "fixed" for fixed-price tasks
- **`bidTypeLabel`**: Human-readable label for the bid type
- **`isFixedPrice`**: Boolean for easy client-side checking

**Error Responses:**
- `400` - Invalid task ID format
- `403` - You are not authorized to view bids for this task
- `404` - Task not found
- `401` - Invalid or expired token
- `500` - Server error

### 6. Accept Bid/Application

**Endpoint:** `POST /api/bids/:id/accept`

**Description:** Accept a bid or application for your task. This will assign the task to the tasker and reject all other pending applications.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Bid accepted successfully",
  "bid": {
    "_id": "507f1f77bcf86cd799439013",
    "task": "507f1f77bcf86cd799439011",
    "tasker": "60d0fe4f5311236168a109cb",
    "amount": 150,
    "message": "I have 5 years of experience",
    "bidType": "custom",
    "status": "accepted",
    "createdAt": "2023-12-07T10:00:00.000Z"
  }
}
```

**What Happens When You Accept:**
1. The selected bid/application status changes to "accepted"
2. The task status changes to "assigned"
3. The task is assigned to the selected tasker
4. All other pending bids/applications are automatically rejected
5. The tasker receives a notification about the acceptance

**Error Responses:**
- `400` - Invalid bid ID format
- `400` - Cannot accept a bid for a task that is not open
- `400` - Cannot accept a bid that is not pending
- `403` - You are not authorized to accept bids for this task
- `404` - Bid not found
- `401` - Invalid or expired token
- `500` - Server error

### 7. Reject Bid/Application

**Endpoint:** `POST /api/bids/:id/reject`

**Description:** Reject a specific bid or application for your task

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body (optional):**
```json
{
  "reason": "Looking for someone with more experience in this area"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Bid rejected successfully",
  "bid": {
    "_id": "507f1f77bcf86cd799439013",
    "status": "rejected"
  }
}
```

**Error Responses:**
- `400` - Invalid bid ID format
- `400` - Cannot reject a bid that is not pending
- `403` - You are not authorized to reject bids for this task
- `404` - Bid not found
- `401` - Invalid or expired token
- `500` - Server error

### 8. Get Bid Details

**Endpoint:** `GET /api/bids/:id`

**Description:** Get detailed information about a specific bid (task owner only)

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
      "isBiddingEnabled": true,
      "status": "open"
    },
    "tasker": {
      "_id": "60d0fe4f5311236168a109cb",
      "firstName": "Jane",
      "lastName": "Smith",
      "profilePicture": "https://example.com/profile.jpg",
      "categories": [
        {
          "_id": "507f1f77bcf86cd799439012",
          "name": "home-cleaning",
          "displayName": "Home Cleaning"
        }
      ]
    },
    "amount": 150,
    "message": "I have 5 years of experience in home cleaning and can provide references",
    "bidType": "custom",
    "status": "pending",
    "createdAt": "2023-12-07T10:00:00.000Z"
  }
}
```

**Usage Examples:**

*Get all bids for a task:*
```bash
curl -X GET "http://localhost:3009/api/bids/task/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer {accessToken}"
```

*Accept a bid:*
```bash
curl -X POST "http://localhost:3009/api/bids/507f1f77bcf86cd799439013/accept" \
  -H "Authorization: Bearer {accessToken}"
```

*Reject a bid with reason:*
```bash
curl -X POST "http://localhost:3009/api/bids/507f1f77bcf86cd799439013/reject" \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Looking for someone with more experience"}'
```

**Understanding Bid Types:**

- **Custom Bids** (`bidType: "custom"`): From bidding-enabled tasks where taskers set their own price
- **Fixed Applications** (`bidType: "fixed"`): From fixed-price tasks where taskers apply at your set budget

**Best Practices:**

1. **Review All Applications**: Check both custom bids and fixed-price applications
2. **Consider Message Content**: Tasker messages often contain valuable information about experience and availability
3. **Check Tasker Profiles**: Use the tasker information to evaluate qualifications
4. **Timely Responses**: Accept or reject applications promptly to maintain good user experience
5. **Clear Communication**: Use rejection reasons to provide feedback to taskers

---

## Account Management

### 9. Change Password

**Endpoint:** `POST /api/auth/change-password`

**Description:** Change user password (requires current password)

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

### 10. Update Profile Picture

**Endpoint:** `PUT /api/auth/profile-picture`

**Description:** Update user profile picture

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

### 11. Logout

**Endpoint:** `POST /api/auth/logout`

**Description:** Logout user (client should discard the token)

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

### 12. Deactivate Account

**Endpoint:** `POST /api/auth/deactivate-account`

**Description:** Deactivate user account (requires password confirmation)

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

## Code Examples

### cURL Examples

#### User Registration
```bash
curl -X POST http://localhost:3009/api/auth/user-register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "emailAddress": "john@example.com",
    "phoneNumber": "+1234567890",
    "password": "password123",
    "country": "United States",
    "residentState": "CA",
    "originState": "TX",
    "address": "123 Main St",
    "dateOfBirth": "1990-05-15"
  }'
```

#### User Login
```bash
curl -X POST http://localhost:3009/api/auth/user-login \
  -H "Content-Type: application/json" \
  -d '{
    "emailAddress": "john@example.com",
    "password": "password123"
  }'
```

#### Get User Profile
```bash
curl -X GET http://localhost:3009/api/auth/user \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Update User Profile
```bash
curl -X PUT http://localhost:3009/api/auth/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "fullName": "Updated Name",
    "phoneNumber": "+1987654321"
  }'
```

#### Update Profile Picture
```bash
curl -X PUT http://localhost:3009/api/auth/profile-picture \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "profilePicture": "https://example.com/images/new-profile.jpg"
  }'
```

### JavaScript Frontend Integration

#### User Login and Token Management
```javascript
// Login function for users
const loginUser = async (email, password) => {
  const response = await fetch('/api/auth/user-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailAddress: email, password })
  });
  
  if (response.ok) {
    const data = await response.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('userType', 'user');
    return data;
  }
  throw new Error('Login failed');
};

// Get user profile
const getUserProfile = async () => {
  const response = await makeAuthenticatedRequest('/api/auth/user', {
    method: 'GET'
  });
  
  if (response && response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to fetch profile');
};

// Update user profile
const updateUserProfile = async (profileData) => {
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

// Update profile picture
const updateProfilePicture = async (profilePictureUrl) => {
  const response = await makeAuthenticatedRequest('/api/auth/profile-picture', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profilePicture: profilePictureUrl })
  });
  
  if (response && response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to update profile picture');
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
// Custom hook for user operations
import { useState, useEffect } from 'react';

const useUser = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const data = await getUserProfile();
      setUser(data.user);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const data = await updateUserProfile(profileData);
      setUser(data.user);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updatePicture = async (profilePictureUrl) => {
    try {
      const data = await updateProfilePicture(profilePictureUrl);
      setUser(prev => ({ ...prev, profilePicture: data.profilePicture }));
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return {
    user,
    loading,
    error,
    updateProfile,
    updatePicture,
    refetch: fetchUserProfile
  };
};

export default useUser;
```

---

## Error Handling

### Common HTTP Status Codes

- **200** - Success
- **201** - Created (registration successful)
- **400** - Bad Request (validation errors, missing fields)
- **401** - Unauthorized (invalid/expired token, invalid credentials)
- **403** - Forbidden (email verification required)
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

#### Phone Number Already in Use
```json
{
  "status": "error",
  "message": "Phone number is already in use"
}
```

---

## User-Specific Features

### Wallet System
- **Field**: `wallet` (number)
- **Purpose**: Tracks user's available balance for paying for tasks
- **Default**: `0`
- **Currency**: Assumed to be in the system's base currency

### Profile Information
- **Full Name**: Single field for user's complete name
- **Location**: Comprehensive address information including origin and resident states
- **Contact**: Email and phone number for communication

---

## Security Considerations

1. **Always use HTTPS in production**
2. **Store JWT tokens securely** (httpOnly cookies recommended for web apps)
3. **Implement token refresh logic** for long-lived sessions
4. **Rate limit authentication endpoints** to prevent brute force attacks
5. **Log security events** for monitoring and auditing
6. **Validate all user inputs** before processing

---

## Getting Started

1. **Register a user account** using the registration endpoint
2. **Verify email** using the email verification endpoint
3. **Login** to receive a JWT token
4. **Update profile** with additional information as needed
5. **Use authenticated endpoints** with the Bearer token

For shared authentication features (email verification, password reset, etc.), refer to the main [API_AUTH_ENDPOINTS.md](./API_AUTH_ENDPOINTS.md) documentation. 