# Enhanced Authentication Features

This document outlines all the new authentication features implemented in the TaskHub backend.

## Overview of New Features

1. **Email Verification System**
2. **Password Reset Functionality**
3. **Enhanced Login Security (Account Locking)**
4. **Profile Management**
5. **Simplified JWT Token System**
6. **Account Management (Deactivation)**
7. **Enhanced JWT Token Security**

## API Endpoints

### Authentication Endpoints

#### User Registration
- **Endpoint**: `POST /api/auth/user-register`
- **Description**: Register a new user with email verification
- **New Features**: 
  - Generates email verification token
  - Sends verification email (if email service configured)
- **Response**: Includes `emailVerificationRequired: true`

#### Tasker Registration
- **Endpoint**: `POST /api/auth/tasker-register`
- **Description**: Register a new tasker with email verification
- **New Features**: Same as user registration

#### Enhanced Login (User/Tasker)
- **Endpoints**: 
  - `POST /api/auth/user-login`
  - `POST /api/auth/tasker-login`
- **New Features**:
  - Account lockout after 5 failed attempts (2-hour lock)
  - Returns JWT token (never expires, new token per login)
  - Tracks last login time
  - Checks account active status
  - Returns email verification status

### Email Verification

#### Verify Email
- **Endpoint**: `GET /api/auth/verify-email?token={token}&type={user|tasker}`
- **Description**: Verify user email with token from email
- **Public**: Yes

#### Resend Verification Email
- **Endpoint**: `POST /api/auth/resend-verification`
- **Body**: 
  ```json
  {
    "emailAddress": "user@example.com",
    "type": "user" // or "tasker"
  }
  ```
- **Public**: Yes

### Password Reset

#### Forgot Password
- **Endpoint**: `POST /api/auth/forgot-password`
- **Body**:
  ```json
  {
    "emailAddress": "user@example.com",
    "type": "user" // or "tasker"
  }
  ```
- **Description**: Sends password reset email with 5-digit code (1-hour expiry)
- **Public**: Yes

#### Reset Password
- **Endpoint**: `POST /api/auth/reset-password`
- **Body**:
  ```json
  {
    "code": "12345",
    "newPassword": "newpassword123",
    "emailAddress": "user@example.com",
    "type": "user" // or "tasker"
  }
  ```
- **Public**: Yes

### Token Management

Token management is now simplified - users receive a single JWT token that never expires. A new token is generated with each login attempt.

### Protected Endpoints (Require Authentication)

#### Change Password
- **Endpoint**: `POST /api/auth/change-password`
- **Headers**: `Authorization: Bearer {jwt-token}`
- **Body**:
  ```json
  {
    "currentPassword": "oldpassword",
    "newPassword": "newpassword123"
  }
  ```

#### Update Profile
- **Endpoint**: `PUT /api/auth/profile`
- **Headers**: `Authorization: Bearer {jwt-token}`
- **Body**: Any combination of allowed fields:
  ```json
  {
    "fullName": "New Name",
    "phoneNumber": "+1234567890",
    "country": "New Country",
    "residentState": "New State",
    "address": "New Address",
    "profilePicture": "url-to-image"
  }
  ```

#### Update Profile Picture
- **Endpoint**: `PUT /api/auth/profile-picture`
- **Headers**: `Authorization: Bearer {jwt-token}`
- **Body**:
  ```json
  {
    "profilePicture": "https://example.com/images/new-profile.jpg"
  }
  ```
- **Description**: Dedicated endpoint for updating profile picture with URL validation

#### Update Tasker Categories
- **Endpoint**: `PUT /api/auth/categories`
- **Headers**: `Authorization: Bearer {jwt-token}`
- **Body**:
  ```json
  {
    "categories": ["home-cleaning", "gardening", "handyman", "plumbing"]
  }
  ```
- **Description**: Tasker-only endpoint for updating service categories. Validates array format and removes duplicates.
- **Access**: Taskers only (403 error for regular users)

#### Logout
- **Endpoint**: `POST /api/auth/logout`
- **Headers**: `Authorization: Bearer {jwt-token}`
- **Description**: Logs out user (client should discard token)

#### Deactivate Account
- **Endpoint**: `POST /api/auth/deactivate-account`
- **Headers**: `Authorization: Bearer {jwt-token}`
- **Body**:
  ```json
  {
    "password": "current-password"
  }
  ```

## Database Schema Changes

### User Model Additions
```javascript
{
  // Email verification
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  
  // Password reset
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  
  // Account status and security
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  

  
  // Timestamps
  updatedAt: { type: Date, default: Date.now }
}
```

### Tasker Model
- Same additions as User model
- Additional field: `verifyIdentity: { type: Boolean, default: false }` - for identity verification status
- Additional field: `categories: [{ type: String }]` - array of categories the tasker can handle

## Security Features

### Account Lockout
- **Trigger**: 5 consecutive failed login attempts
- **Duration**: 2 hours
- **Reset**: Successful login or password reset clears attempts

### Token Security
- **JWT Token**: Never expires (new token generated per login)
- **Email Verification**: 24-hour expiry
- **Password Reset Code**: 5-digit code, 1-hour expiry

### Password Requirements
- Minimum 6 characters
- Hashed with bcrypt (salt rounds: 10)

## Middleware Enhancements

### New Middleware Functions

#### `protectAny`
- Works for both users and taskers
- Automatically detects user type
- Adds `req.userType` ('user' or 'tasker')

#### `requireEmailVerification`
- Optional middleware to enforce email verification
- Returns 403 if email not verified

#### `optionalAuth`
- Adds user info if token present but doesn't require it
- Useful for public endpoints that can benefit from user context

### Enhanced Security Checks
- Account active status verification
- Account lock status verification
- Better JWT error handling (expired vs invalid)

## Email Configuration

### Environment Variables
```env
# Email service configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@taskhub.com

# Frontend URL for email links
FRONTEND_URL=http://localhost:3000

# JWT Secrets (change these in production!)
JWT_SECRET=your-super-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
```

### Email Templates
- Professional HTML email templates included
- Verification and password reset emails
- Responsive design for mobile/desktop

## Usage Examples

### Frontend Integration

#### Login Flow
```javascript
// 1. Login
const loginResponse = await fetch('/api/auth/user-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ emailAddress, password })
});

const { accessToken, refreshToken, isEmailVerified } = await loginResponse.json();

// 2. Store tokens
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);

// 3. Check email verification
if (!isEmailVerified) {
  // Show email verification notice
}
```

#### Token Refresh
```javascript
// When access token expires (401 error)
const refreshResponse = await fetch('/api/auth/refresh-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    refreshToken: localStorage.getItem('refreshToken'),
    type: 'user' 
  })
});

if (refreshResponse.ok) {
  const { accessToken, refreshToken } = await refreshResponse.json();
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
} else {
  // Redirect to login
}
```

#### Profile Update
```javascript
const response = await fetch('/api/auth/profile', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  },
  body: JSON.stringify({ fullName: 'New Name' })
});
```

## Error Handling

### Common Error Responses

#### Authentication Errors (401)
```json
{
  "status": "error",
  "message": "Token expired. Please login again."
}
```

#### Account Status Errors
```json
{
  "status": "error",
  "message": "Account temporarily locked due to too many failed login attempts."
}
```

#### Email Verification Required (403)
```json
{
  "status": "error",
  "message": "Email verification required. Please verify your email to access this feature.",
  "emailVerificationRequired": true
}
```

## Security Best Practices

1. **Always use HTTPS in production**
2. **Set strong JWT secrets**
3. **Configure email service properly**
4. **Implement rate limiting on auth endpoints**
5. **Log authentication events for monitoring**
6. **Use environment variables for configuration**
7. **Regular security audits**

## Testing

### Email Testing (Development)
- Emails are logged to console if email service not configured
- Use services like Mailtrap for testing email flows

### Postman Testing
- Update Authorization headers with access tokens
- Test token refresh flows
- Verify error responses for locked accounts

## Production Considerations

1. **Email Service**: Configure with your email provider (Gmail, SendGrid, etc.)
2. **Database Indexing**: Add indexes on email fields and tokens
3. **Rate Limiting**: Implement rate limiting on auth endpoints
4. **Monitoring**: Set up alerts for failed login attempts
5. **Backup**: Regular backups of user authentication data
6. **SSL/TLS**: Ensure all communications are encrypted

## Migration Notes

- Existing users will have `isEmailVerified: false` and `isActive: true`
- No breaking changes to existing API endpoints
- New fields are optional and have sensible defaults
- Existing JWT tokens will continue to work until expiry 