# NIN Verification API Documentation

## Overview

This documentation covers the external NIN (National Identity Number) verification API integration using QoreID services. The API provides two main functionalities:

1. **Token Generation** - Generate bearer tokens for authentication
2. **NIN Verification** - Verify customer identity using their National Identity Number

---

## Base URL

```
https://api.qoreid.com
```

---

## Authentication

The API uses Bearer token authentication. You must first generate a token using your client credentials before making verification requests.

### Client Credentials

- **Client ID:** `ZUQ34D5WQJ2B86OOXMT7`
- **Secret Key:** `0ca3b4df6ae84782a05e6f12c728d3af`

---

## API Endpoints

### 1. Generate Bearer Token

**Endpoint:**  
`POST /token`

**Description:**  
Generate an access token using client credentials for subsequent API calls.

**Headers:**
```
Accept: text/plain
Content-Type: application/json
```

**Request Body:**
```json
{
  "clientId": "ZUQ34D5WQJ2B86OOXMT7",
  "secret": "0ca3b4df6ae84782a05e6f12c728d3af"
}
```

**cURL Example:**
```bash
curl -X POST https://api.qoreid.com/token \
  -H "Accept: text/plain" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "ZUQ34D5WQJ2B86OOXMT7",
    "secret": "0ca3b4df6ae84782a05e6f12c728d3af"
  }'
```

**JavaScript Example:**
```javascript
const options = {
  method: 'POST',
  headers: {
    accept: 'text/plain', 
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    clientId: 'ZUQ34D5WQJ2B86OOXMT7', 
    secret: '0ca3b4df6ae84782a05e6f12c728d3af'
  })
};

fetch('https://api.qoreid.com/token', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

#### Response Examples

**Success Response (201 Created):**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICIzaVgtaEFrS3RmNUlsYWhRcElrNWwwbFBRVlNmVnpBdG9WVWQ4UXZ1OHJFIn0.eyJleHAiOjE3NTM3NzkzNjcsImlhdCI6MTc1Mzc3MjE2NywianRpIjoiNjNmOWRlODctMzFmMC00OTM5LWE2MWUtNmFhMzViZmFlNmZjIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLnFvcmVpZC5jb20vYXV0aC9yZWFsbXMvcW9yZWlkIiwiYXVkIjpbInFvcmVpZGFwaSIsImFjY291bnQiXSwic3ViIjoiZmQ5NGIwODctZjkzNC00ZWUxLTk2ZTQtM2JjNzU5NWM2MzYwIiwidHlwIjoiQmVhcmVyIiwiYXpwIjoiWlVRMzRENVdRSjJCODZPT1hNVDciLCJhY3IiOiIxIiwicmVhbG1fYWNjZXNzIjp7InJvbGVzIjpbIm9mZmxpbmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iLCJkZWZhdWx0LXJvbGVzLXFvcmVpZCJdfSwicmVzb3VyY2VfYWNjZXNzIjp7InFvcmVpZGFwaSI6eyJyb2xlcyI6WyJ2ZXJpZnlfbmluX3N1YiJdfSwiYWNjb3VudCI6eyJyb2xlcyI6WyJtYW5hZ2UtYWNjb3VudCIsIm1hbmFnZS1hY2NvdW50LWxpbmtzIiwidmlldy1wcm9maWxlIl19fSwic2NvcGUiOiJwcm9maWxlIGVtYWlsIiwiZW52aXJvbm1lbnQiOiJzYW5kYm94IiwiY2xpZW50SWQiOiJaVVEzNEQ1V1FKMkI4Nk9PWE1UNyIsIm9yZ2FuaXNhdGlvbklkIjoyNTIwMTIsImNsaWVudEhvc3QiOiIxOTIuMTY4LjIzOC45MCIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwicHJlZmVycmVkX3VzZXJuYW1lIjoic2VydmljZS1hY2NvdW50LXp1cTM0ZDV3cWoyYjg2b294bXQ3IiwiYXBwbGljYXRpb25JZCI6MjU0MjksImNsaWVudEFkZHJlc3MiOiIxOTIuMTY4LjIzOC45MCJ9.fUR5DT3p_dAQ52j6kYGO9uW7qLrOyUcJRFSU4wax7ROc91FN2yZUwxuOoGWBWiXYnqLa1UASHMAtvFtFDg3NX2knVmbCsWMKtGVi6VPQiNcW4eCjnElVBmO6KlmiqsImXJLp_rgFvyJflXNnzTyXFouOZVGsb8FxzeXpyCtP-Km80mJ2CCccTQPTJRi8BTFHXXOdwVX_Lciv1NciLW2LeXAyWY_DNgAAn9UeAcb_y81WLHNV9k4tnKS5xCne3TjBViHytHdasfG0ceGILp_VG5rWwj0XBnsrc4uRFTz3jGbCWB0s22S3LIEm4AKVoyQ_EN_VnbHw2xCMRfdoU7Rxvw",
  "expiresIn": 7200,
  "tokenType": "Bearer"
}
```

**Error Response (404 Not Found):**
```json
{
  "status": 404,
  "statusCode": 404,
  "message": "Application Not Found",
  "error": "Not Found"
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "statusCode": 0,
  "message": "Application Not Found"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | string | JWT bearer token for API authentication |
| `expiresIn` | number | Token expiration time in seconds (7200 = 2 hours) |
| `tokenType` | string | Token type (always "Bearer") |

---

### 2. NIN Verification

**Endpoint:**  
`POST /v1/ng/identities/nin/{nin}`

**Description:**  
Verify a customer's identity using their National Identity Number (NIN) and personal details.

**Headers:**
```
Accept: application/json
Content-Type: application/json
Authorization: Bearer {accessToken}
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nin` | string | Yes | The 11-digit National Identity Number |

**Request Body:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `firstname` | string | Yes | First name of the individual | "Bunch" |
| `lastname` | string | Yes | Last name of the individual | "Dillon" |
| `dob` | string | No | Date of birth (YYYY-MM-DD format) | "2004-01-15" |
| `phone` | string | No | Phone number | "08145548609" |
| `email` | string | No | Email address | "amirizew@gmail.com" |
| `gender` | string | No | Gender (m/f) | "m" |

**Request Body Example:**
```json
{
  "firstname": "Bunch",
  "lastname": "Dillon",
  "dob": "2004-01-15",
  "phone": "08145548609",
  "email": "amirizew@gmail.com",
  "gender": "m"
}
```

**cURL Example:**
```bash
curl -X POST "https://api.qoreid.com/v1/ng/identities/nin/98578275878" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "firstname": "Bunch",
    "lastname": "Dillon",
    "dob": "2004-01-15",
    "phone": "08145548609",
    "email": "amirizew@gmail.com",
    "gender": "m"
  }'
```

**JavaScript Example:**
```javascript
const options = {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: 'Bearer YOUR_ACCESS_TOKEN'
  },
  body: JSON.stringify({
    firstname: 'Bunch',
    lastname: 'Dillon',
    dob: '2004-01-15',
    phone: '08145548609',
    email: 'amirizew@gmail.com',
    gender: 'm'
  })
};

fetch('https://api.qoreid.com/v1/ng/identities/nin/98578275878', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

#### Response Examples

**Exact Match (200 OK):**
```json
{
  "id": 83794528,
  "applicant": {
    "firstname": "Bunch",
    "lastname": "Dillon",
    "dob": "1974-01-06",
    "phone": "08145548609",
    "email": "amirizeww@gmail.com",
    "gender": "m"
  },
  "summary": {
    "nin_check": {
      "status": "EXACT_MATCH",
      "fieldMatches": {
        "firstname": true,
        "lastname": true,
        "gender": true,
        "phoneNumber": false,
        "emailAddress": false
      }
    }
  },
  "status": {
    "state": "complete",
    "status": "verified"
  },
  "nin": {
    "nin": "63184876213",
    "firstname": "Bunch",
    "lastname": "Dillon",
    "middlename": "",
    "phone": "0800000000000",
    "gender": "m",
    "photo": "/9j/4AAQSkZJRgABAgAAAQABAAD/2wBDAAgGBgcGBQgHBwcJoEf//Z",
    "birthdate": "06-01-1974",
    "residence": {
      "address1": "1193 TOLA CRESENT",
      "lga": "Abuja Municipal",
      "state": "FCT Abuja"
    }
  }
}
```

**Partial Match (200 OK):**
```json
{
  "id": 83794711,
  "applicant": {
    "firstname": "Bunch",
    "lastname": "Dillo",
    "dob": "1974-01-06",
    "phone": "08145548609",
    "email": "amirizeww@gmail.com",
    "gender": "m"
  },
  "summary": {
    "nin_check": {
      "status": "PARTIAL_MATCH",
      "fieldMatches": {
        "firstname": true,
        "lastname": true,
        "gender": true,
        "phoneNumber": false,
        "emailAddress": false
      }
    }
  },
  "status": {
    "state": "complete",
    "status": "verified"
  },
  "nin": {
    "nin": "63184876213",
    "firstname": "Bunch",
    "lastname": "Dillon",
    "middlename": "",
    "phone": "0800000000000",
    "gender": "m",
    "photo": "/9j/4AAQSkZJRgABAgAAAQABAAD/2wBDAAgGBgcGBQgHBwcJBPeKPsA4HWsW0A/tIcdqKKpCKU//AB+S/U1paUT5cv8Au0UUCKD/AH2+tWNP/wCPhaKKCkSX3/Hy1QxE7k5/ioooBmvf/wCpiNUFoooEf//Z",
    "birthdate": "06-01-1974",
    "residence": {
      "address1": "1193 TOLA CRESENT",
      "lga": "Abuja Municipal",
      "state": "FCT Abuja"
    }
  }
}
```

**No Match (200 OK):**
```json
{
  "id": 83795182,
  "applicant": {
    "firstname": "ch",
    "lastname": "Dillo",
    "dob": "1974-01-06",
    "phone": "08145548609",
    "email": "amirizeww@gmail.com",
    "gender": "m"
  },
  "summary": {
    "nin_check": {
      "status": "NO_MATCH",
      "fieldMatches": {
        "firstname": false,
        "lastname": true,
        "gender": true,
        "phoneNumber": false,
        "emailAddress": false
      }
    }
  },
  "status": {
    "state": "complete",
    "status": "id_mismatch"
  }
}
```

**NIN Not Found (404 Not Found):**
```json
{
  "status": 404,
  "statusCode": 404,
  "message": "NIN not found. Provide a valid NIN",
  "error": "HttpException"
}
```

**Unauthorized (401 Unauthorized):**
```json
{
  "statusCode": 0,
  "message": "Unauthorized access"
}
```

**Internal Server Error (500):**
```json
{
  "statusCode": 0,
  "message": "Internal server error"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique verification request ID |
| `applicant` | object | Details of the person being verified |
| `summary.nin_check.status` | string | Verification status: `EXACT_MATCH`, `PARTIAL_MATCH`, `NO_MATCH` |
| `summary.nin_check.fieldMatches` | object | Boolean values indicating which fields matched |
| `status.state` | string | Request state: `complete` |
| `status.status` | string | Verification result: `verified`, `id_mismatch` |
| `nin` | object | Official NIN record details from government database |
| `nin.photo` | string | Base64 encoded photo from NIN record |
| `nin.residence` | object | Address information from NIN record |

---

## Match Status Types

### EXACT_MATCH
All required fields (firstname, lastname) and provided optional fields match exactly with the NIN record.

### PARTIAL_MATCH  
Required fields match, but some optional fields may not match or have slight variations.

### NO_MATCH
Critical fields (firstname, lastname) do not match with the NIN record.

---

## Error Handling

### Common Error Codes

| Status Code | Description | Possible Causes |
|-------------|-------------|-----------------|
| 400 | Bad Request | Invalid request parameters or missing required fields |
| 401 | Unauthorized | Invalid or expired access token |
| 404 | Not Found | Invalid NIN or application not found |
| 500 | Internal Server Error | Server-side processing error |

### Error Response Format

All error responses follow this structure:
```json
{
  "status": 404,
  "statusCode": 404,
  "message": "Error description",
  "error": "Error type"
}
```

---

## Rate Limits

- Token generation: No specific limit mentioned
- NIN verification: No specific limit mentioned
- Token expiration: 7200 seconds (2 hours)

---

## Best Practices

1. **Token Management**
   - Store tokens securely
   - Implement token refresh logic before expiration
   - Never expose client credentials in frontend code

2. **Request Optimization**
   - Reuse tokens until expiration
   - Implement proper error handling and retries
   - Cache successful verifications to avoid duplicate requests

3. **Data Validation**
   - Validate NIN format (11 digits) before API calls
   - Ensure names match exactly for better verification results
   - Use consistent date formats (YYYY-MM-DD)

4. **Security**
   - Use HTTPS for all API calls
   - Implement proper logging for audit trails
   - Never log sensitive data like full NIN numbers

---

## Integration Examples

### Node.js/TypeScript Example

```typescript
interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

interface NINVerificationRequest {
  firstname: string;
  lastname: string;
  dob?: string;
  phone?: string;
  email?: string;
  gender?: 'm' | 'f';
}

interface NINVerificationResponse {
  id: number;
  applicant: NINVerificationRequest;
  summary: {
    nin_check: {
      status: 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH';
      fieldMatches: {
        firstname: boolean;
        lastname: boolean;
        gender: boolean;
        phoneNumber: boolean;
        emailAddress: boolean;
      };
    };
  };
  status: {
    state: string;
    status: string;
  };
  nin?: {
    nin: string;
    firstname: string;
    lastname: string;
    middlename: string;
    phone: string;
    gender: string;
    photo: string;
    birthdate: string;
    residence: {
      address1: string;
      lga: string;
      state: string;
    };
  };
}

class NINVerificationService {
  private baseURL = 'https://api.qoreid.com';
  private clientId = 'ZUQ34D5WQJ2B86OOXMT7';
  private secret = '0ca3b4df6ae84782a05e6f12c728d3af';
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch(`${this.baseURL}/token`, {
      method: 'POST',
      headers: {
        'Accept': 'text/plain',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: this.clientId,
        secret: this.secret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token generation failed: ${response.statusText}`);
    }

    const data: TokenResponse = await response.json();
    this.accessToken = data.accessToken;
    this.tokenExpiry = new Date(Date.now() + (data.expiresIn * 1000));

    return this.accessToken;
  }

  async verifyNIN(nin: string, applicantData: NINVerificationRequest): Promise<NINVerificationResponse> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseURL}/v1/ng/identities/nin/${nin}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(applicantData),
    });

    if (!response.ok) {
      throw new Error(`NIN verification failed: ${response.statusText}`);
    }

    return await response.json();
  }
}

// Usage example
const ninService = new NINVerificationService();

async function verifyCustomer() {
  try {
    const result = await ninService.verifyNIN('98578275878', {
      firstname: 'Bunch',
      lastname: 'Dillon',
      dob: '2004-01-15',
      phone: '08145548609',
      email: 'amirizew@gmail.com',
      gender: 'm'
    });

    console.log('Verification result:', result);
    
    switch (result.summary.nin_check.status) {
      case 'EXACT_MATCH':
        console.log('Identity verified successfully');
        break;
      case 'PARTIAL_MATCH':
        console.log('Identity partially verified');
        break;
      case 'NO_MATCH':
        console.log('Identity verification failed');
        break;
    }
  } catch (error) {
    console.error('Verification error:', error);
  }
}
```

---

## Environment Configuration

### Development
```
QOREID_BASE_URL=https://api.qoreid.com
QOREID_CLIENT_ID=ZUQ34D5WQJ2B86OOXMT7
QOREID_SECRET=0ca3b4df6ae84782a05e6f12c728d3af
QOREID_ENVIRONMENT=sandbox
```

### Production
```
QOREID_BASE_URL=https://api.qoreid.com
QOREID_CLIENT_ID=your_production_client_id
QOREID_SECRET=your_production_secret
QOREID_ENVIRONMENT=production
```

---

## Support and Resources

For additional support and resources:
- API Support: Contact QoreID support team
- Documentation Updates: Check QoreID developer portal
- Status Page: Monitor API availability and incidents

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-29 | Initial documentation creation |

---

## License

This documentation is provided for integration purposes. Please refer to QoreID's terms of service for API usage terms and conditions.
