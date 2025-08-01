# NIN Identity Verification API Endpoints

This document outlines the API endpoints for National Identity Number (NIN) verification for taskers in the TaskHub system.

## Base URL
```
/api/auth
```

## Authentication
All endpoints require tasker authentication using Bearer token.

## Endpoints

### 1. Verify Tasker Identity

**Endpoint:** `POST /api/auth/verify-identity`

**Description:** Verify a tasker's identity using their NIN and personal details through the QoreID API.

**Authentication:** Required (Tasker only)

**Headers:**
```
Authorization: Bearer <tasker_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "nin": "12345678901",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-15",
  "gender": "male",
  "phoneNumber": "08123456789",
  "email": "john.doe@example.com"
}
```

**Required Fields:**
- `nin` (string): 11-digit National Identity Number
- `firstName` (string): Tasker's first name
- `lastName` (string): Tasker's last name  
- `dateOfBirth` (string): Date of birth in YYYY-MM-DD format
- `gender` (string): Gender - "male" or "female"

**Optional Fields:**
- `phoneNumber` (string): Phone number (uses tasker's registered number if not provided)
- `email` (string): Email address (uses tasker's registered email if not provided)

**Success Response (200 OK):**
```json
{
  "status": "success",
  "message": "Identity verification successful",
  "data": {
    "isVerified": true,
    "matchStatus": "EXACT_MATCH",
    "verificationId": 83794528,
    "tasker": {
      "id": "60f1b2a3c45d6e7f8a9b0c1d",
      "firstName": "John",
      "lastName": "Doe",
      "verifyIdentity": true
    }
  }
}
```

**Verification Failed Response (400 Bad Request):**
```json
{
  "status": "error",
  "message": "Identity verification failed",
  "data": {
    "isVerified": false,
    "matchStatus": "NO_MATCH",
    "mismatches": [
      "First name does not match NIN record",
      "Date of birth does not match NIN record"
    ],
    "verificationId": 83795182
  }
}
```

**Error Responses:**

**Already Verified (400 Bad Request):**
```json
{
  "status": "error",
  "message": "Identity already verified for this tasker"
}
```

**Invalid NIN Format (400 Bad Request):**
```json
{
  "status": "error",
  "message": "Invalid NIN format. NIN must be 11 digits."
}
```

**NIN Not Found (404 Not Found):**
```json
{
  "status": "error",
  "message": "NIN not found. Please provide a valid NIN."
}
```

**Unauthorized (401 Unauthorized):**
```json
{
  "status": "error",
  "message": "Authentication failed. Please try again."
}
```

---

### 2. Get Verification Status

**Endpoint:** `GET /api/auth/verification-status`

**Description:** Get the current identity verification status of the authenticated tasker.

**Authentication:** Required (Tasker only)

**Headers:**
```
Authorization: Bearer <tasker_jwt_token>
```

**Success Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "taskerId": "60f1b2a3c45d6e7f8a9b0c1d",
    "firstName": "John",
    "lastName": "Doe",
    "isVerified": true
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "status": "error",
  "message": "Tasker not found"
}
```

---

## Match Status Types

### EXACT_MATCH
All provided fields match exactly with the NIN record. Verification successful.

### PARTIAL_MATCH  
Required fields match, but some optional fields may have slight variations. Verification successful.

### NO_MATCH
Critical fields (firstname, lastname) do not match with the NIN record. Verification failed.

---

## Implementation Notes

1. **One-time Verification**: Once a tasker's identity is verified, they cannot be verified again.

2. **Data Privacy**: The actual NIN number is not stored in the database for privacy and security.

3. **Field Matching**: The system performs case-insensitive comparison for names and handles flexible gender formats.

4. **Date Format**: Date of birth should be provided in ISO format (YYYY-MM-DD).

5. **Error Handling**: The API provides detailed error messages for debugging while maintaining user privacy.

6. **External API**: Verification is performed using the QoreID API service.

---

## cURL Examples

### Verify Identity
```bash
curl -X POST http://localhost:3009/api/auth/verify-identity \
  -H "Authorization: Bearer <tasker_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "nin": "12345678901",
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-15",
    "gender": "male",
    "phoneNumber": "08123456789",
    "email": "john.doe@example.com"
  }'
```

### Get Verification Status
```bash
curl -X GET http://localhost:3009/api/auth/verification-status \
  -H "Authorization: Bearer <tasker_jwt_token>"
```

---

## Frontend Integration

### JavaScript Example
```javascript
// Verify tasker identity
const verifyIdentity = async (identityData) => {
  try {
    const response = await fetch('/api/auth/verify-identity', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('taskerToken')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(identityData)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      console.log('Identity verified successfully');
      return result.data;
    } else {
      console.error('Verification failed:', result.message);
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Verification error:', error);
    throw error;
  }
};

// Check verification status
const checkVerificationStatus = async () => {
  try {
    const response = await fetch('/api/auth/verification-status', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('taskerToken')}`
      }
    });
    
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Status check error:', error);
    throw error;
  }
};
```

---

## Security Considerations

1. **Token Expiration**: QoreID tokens expire after 2 hours and are automatically refreshed.

2. **Rate Limiting**: Implement rate limiting to prevent abuse of the verification endpoint.

3. **Logging**: All verification attempts are logged for audit purposes (without storing sensitive data).

4. **Data Sanitization**: All input data is validated and sanitized before processing.

5. **HTTPS Only**: All API calls to external services use HTTPS encryption.
