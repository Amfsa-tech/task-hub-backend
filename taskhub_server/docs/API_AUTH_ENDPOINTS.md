# TaskHub Authentication API Documentation

Base URL: `http://localhost:3009/api/auth`

## Documentation Structure

For better organization, the API documentation is split into specialized files:

- **[API_USER_ENDPOINTS.md](./API_USER_ENDPOINTS.md)** - User-specific endpoints (registration, login, profile management)
- **[API_TASKER_ENDPOINTS.md](./API_TASKER_ENDPOINTS.md)** - Tasker-specific endpoints (registration, login, categories, profile management)
- **This file** - Shared authentication features (email verification, password reset)

## Table of Contents

1. [Shared Authentication Features](#shared-authentication-features)
2. [Email Verification Endpoints](#email-verification-endpoints)
3. [Password Reset Endpoints](#password-reset-endpoints)
4. [Usage Examples](#usage-examples)
5. [Error Responses](#error-responses)
6. [Authentication Headers](#authentication-headers)

---

## Shared Authentication Features

The following endpoints work for both users and taskers by specifying the `type` parameter.

---



## Email Verification Endpoints

### 1. Verify Email

**Endpoint:** `POST /api/auth/verify-email`

**Description:** Verify user email with verification code sent via email

**Request Body:**
```json
{
  "code": "12345",
  "emailAddress": "john.doe@example.com",
  "type": "user"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Email verified successfully"
}
```

**Error Responses:**
- `400` - Missing verification code, email address, or type
- `400` - Invalid or expired verification code
- `500` - Server error

### 2. Resend Email Verification

**Endpoint:** `POST /api/auth/resend-verification`

**Description:** Resend email verification link

**Request Body:**
```json
{
  "emailAddress": "john.doe@example.com",
  "type": "user"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Verification code sent successfully"
}
```

**Error Responses:**
- `400` - Missing email or type
- `400` - User not found
- `400` - Email already verified
- `500` - Server error

---

## Password Reset Endpoints

### 3. Forgot Password

**Endpoint:** `POST /api/auth/forgot-password`

**Description:** Request password reset email with 5-digit code

**Request Body:**
```json
{
  "emailAddress": "john.doe@example.com",
  "type": "user"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "If the email exists, a password reset code has been sent"
}
```

**Note:** Response is the same whether email exists or not (security feature)

### 4. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Description:** Reset password using 5-digit code from email

**Request Body:**
```json
{
  "code": "12345",
  "newPassword": "newSecurePassword456",
  "emailAddress": "john.doe@example.com",
  "type": "user"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Password reset successfully"
}
```

**Error Responses:**
- `400` - Missing required fields (code, newPassword, emailAddress, type)
- `400` - Password too short (minimum 6 characters)
- `400` - Invalid or expired reset code, or email address does not match
- `500` - Server error

---

## User Profile Endpoints

### 9. Get User Profile

**Endpoint:** `GET /api/auth/user`

**Description:** Get current user profile information

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
    "dateOfBirth": "1990-01-15T00:00:00.000Z",
    "profilePicture": "",
    "country": "United States",
    "residentState": "California",
    "address": "123 Main Street, Los Angeles, CA",
    "wallet": 0,
    "isEmailVerified": true,
    "lastLogin": "2023-12-07T10:30:00.000Z",
    "createdAt": "2023-12-01T08:00:00.000Z"
  }
}
```

### 10. Get Tasker Profile

**Endpoint:** `GET /api/auth/tasker`

**Description:** Get current tasker profile information. The response includes populated categories with full details (name, displayName, description, isActive status).

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

### 11. Update Profile

**Endpoint:** `PUT /api/auth/profile`

**Description:** Update user/tasker profile information

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

### 12. Update Profile Picture

**Endpoint:** `PUT /api/auth/profile-picture`

**Description:** Update user/tasker profile picture

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

**Error Responses:**
- `400` - Missing profile picture URL
- `400` - Invalid profile picture URL format
- `401` - Invalid or expired token
- `500` - Server error

### 13. Update Tasker Categories

**Endpoint:** `PUT /api/auth/categories`

**Description:** Update categories that a tasker can handle (taskers only)

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "categories": ["home-cleaning", "gardening", "handyman", "plumbing"]
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Categories updated successfully",
  "categories": ["home-cleaning", "gardening", "handyman", "plumbing"]
}
```

**Error Responses:**
- `400` - Categories array is required
- `400` - Categories must be an array of strings
- `400` - At least one valid category is required
- `403` - This endpoint is only available for taskers
- `401` - Invalid or expired token
- `500` - Server error

### 14. Change Password

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

**Error Responses:**
- `400` - Missing current or new password
- `400` - New password too short
- `400` - Current password incorrect
- `401` - Invalid or expired token
- `500` - Server error

---

## Account Management

### 15. Logout

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

### 16. Deactivate Account

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

**Error Responses:**
- `400` - Missing password
- `400` - Incorrect password
- `401` - Invalid or expired token
- `500` - Server error

---

## Error Responses

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

### Specific Error Examples

**Missing Fields (400):**
```json
{
  "status": "error",
  "message": "Missing required fields",
  "missingFields": ["fullName", "emailAddress"]
}
```

**Account Locked (400):**
```json
{
  "status": "error",
  "message": "Account temporarily locked due to too many failed login attempts."
}
```

**Token Expired (401):**
```json
{
  "status": "error",
  "message": "Token expired. Please login again."
}
```

**Email Verification Required (403):**
```json
{
  "status": "error",
  "message": "Email verification required. Please verify your email to access this feature.",
  "emailVerificationRequired": true
}
```

---

## Authentication Headers

### JWT Token Usage

For protected endpoints, include the JWT token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Expiry

- **JWT Token**: Never expires (new token generated on each login)
- **Email Verification Token**: 24 hours
- **Password Reset Code**: 1 hour

### Token Management

JWT tokens don't expire, but a new token is generated with every login attempt. Users can remain logged in indefinitely unless they logout or their account is deactivated.

---

## Usage Examples

### cURL Examples

#### User Registration
```bash
curl -X POST http://localhost:3009/api/auth/user-register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "emailAddress": "john@example.com",
    "phoneNumber": "+1234567890",
    "country": "USA",
    "residentState": "CA",
    "address": "123 Main St",
    "password": "password123",
    "dateOfBirth": "1990-01-01"
  }'
```

#### Tasker Registration
```bash
curl -X POST http://localhost:3009/api/auth/tasker-register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "emailAddress": "jane@example.com",
    "phoneNumber": "+1234567891",
    "country": "USA",
    "residentState": "CA",
    "originState": "TX",
    "address": "456 Oak Ave",
    "password": "password123",
    "dateOfBirth": "1992-03-20"
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

#### Email Verification
```bash
curl -X POST http://localhost:3009/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "code": "a1b2c3d4e5",
    "emailAddress": "john@example.com",
    "type": "user"
  }'
```

#### Get User Profile
```bash
curl -X GET http://localhost:3009/api/auth/user \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Forgot Password
```bash
curl -X POST http://localhost:3009/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "emailAddress": "john@example.com",
    "type": "user"
  }'
```

#### Reset Password
```bash
curl -X POST http://localhost:3009/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "code": "12345",
    "newPassword": "newSecurePassword456",
    "emailAddress": "john@example.com",
    "type": "user"
  }'
```

#### Update Profile
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

#### Update Tasker Categories
```bash
curl -X PUT http://localhost:3009/api/auth/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "categories": ["home-cleaning", "gardening", "handyman", "plumbing"]
  }'
```



### JavaScript Frontend Integration

#### Login and Token Management
```javascript
// Login function
const loginUser = async (email, password) => {
  const response = await fetch('/api/auth/user-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailAddress: email, password })
  });
  
  if (response.ok) {
    const data = await response.json();
    localStorage.setItem('token', data.token);
    return data;
  }
  throw new Error('Login failed');
};

// Email verification function
const verifyEmail = async (code, emailAddress, type = 'user') => {
  const response = await fetch('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, emailAddress, type })
  });
  
  if (response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Email verification failed');
};

// Resend verification code
const resendVerificationCode = async (emailAddress, type = 'user') => {
  const response = await fetch('/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailAddress, type })
  });
  
  if (response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to resend verification code');
};

// Forgot password function
const forgotPassword = async (emailAddress, type = 'user') => {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailAddress, type })
  });
  
  if (response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to send password reset code');
};

// Reset password function
const resetPassword = async (code, newPassword, emailAddress, type = 'user') => {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, newPassword, emailAddress, type })
  });
  
  if (response.ok) {
    const data = await response.json();
    return data;
  }
  throw new Error('Failed to reset password');
};

// Update profile picture function
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

// Update tasker categories function
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

// Authenticated request function
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
  
  // If token is invalid, redirect to login
  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return null;
  }
  
  return response;
};

// Logout function
const logout = async () => {
  try {
    await makeAuthenticatedRequest('/api/auth/logout', {
      method: 'POST'
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
};
```

---

## Security Notes

1. **Always use HTTPS in production**
2. **Store tokens securely** (consider using localStorage or sessionStorage)
3. **Implement proper error handling** for all token-related operations
4. **Handle invalid tokens gracefully** by redirecting to login
5. **Validate all input** on the frontend before sending to API
6. **Use strong passwords** and consider implementing password strength indicators

---

This completes the TaskHub Authentication API documentation. All endpoints are ready for integration with frontend applications. 