# Admin API Endpoints

This document covers all administrative endpoints for managing the TaskHub platform. Admin access is required for all endpoints in this document.

## Authentication

All admin endpoints require authentication with an admin user account. Include the JWT token in the Authorization header:

```
Authorization: Bearer <admin_jwt_token>
```

## Category Management

### 1. Create Category

**POST** `/api/categories/admin`

Creates a new category that will be available for selection by users and taskers.

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <admin_jwt_token>
```

**Request Body:**
```json
{
  "name": "plumbing-repair",
  "displayName": "Plumbing Repair",
  "description": "Professional plumbing services including repairs, installations, and maintenance"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "message": "Category created successfully",
  "category": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "plumbing-repair",
    "displayName": "Plumbing Repair",
    "description": "Professional plumbing services including repairs, installations, and maintenance",
    "isActive": true,
    "createdBy": "507f1f77bcf86cd799439012",
    "createdAt": "2023-12-07T10:30:00.000Z",
    "updatedAt": "2023-12-07T10:30:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/categories/admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -d '{
    "name": "plumbing-repair",
    "displayName": "Plumbing Repair",
    "description": "Professional plumbing services including repairs, installations, and maintenance"
  }'
```

### 2. Get All Categories (Admin View)

**GET** `/api/categories/admin/all`

Retrieves all categories including inactive ones with full details and creator information.

**Query Parameters:**
- `showInactive` (optional): Set to "true" to include inactive categories

**Response (200 OK):**
```json
{
  "status": "success",
  "count": 2,
  "categories": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "plumbing-repair",
      "displayName": "Plumbing Repair",
      "description": "Professional plumbing services",
      "isActive": true,
      "createdBy": {
        "_id": "507f1f77bcf86cd799439012",
        "fullName": "Admin User",
        "emailAddress": "admin@taskhub.com"
      },
      "createdAt": "2023-12-07T10:30:00.000Z",
      "updatedAt": "2023-12-07T10:30:00.000Z"
    }
  ]
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/categories/admin/all?showInactive=true" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

### 3. Update Category

**PUT** `/api/categories/admin/:id`

Updates an existing category's information.

**Request Body:**
```json
{
  "name": "advanced-plumbing",
  "displayName": "Advanced Plumbing Services",
  "description": "Expert plumbing services for complex installations and repairs",
  "isActive": true
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Category updated successfully",
  "category": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "advanced-plumbing",
    "displayName": "Advanced Plumbing Services",
    "description": "Expert plumbing services for complex installations and repairs",
    "isActive": true,
    "createdBy": "507f1f77bcf86cd799439012",
    "createdAt": "2023-12-07T10:30:00.000Z",
    "updatedAt": "2023-12-07T11:15:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3000/api/categories/admin/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -d '{
    "displayName": "Advanced Plumbing Services",
    "description": "Expert plumbing services for complex installations and repairs"
  }'
```

### 4. Deactivate Category

**PATCH** `/api/categories/admin/:id/deactivate`

Safely deactivates a category instead of deleting it. Prevents deactivation if the category is currently in use.

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Category deactivated successfully"
}
```

**Response (400 Bad Request) - If category is in use:**
```json
{
  "status": "error",
  "message": "Cannot deactivate category. It is currently being used by 5 tasks and 3 taskers.",
  "usage": {
    "tasks": 5,
    "taskers": 3
  }
}
```

**cURL Example:**
```bash
curl -X PATCH http://localhost:3000/api/categories/admin/507f1f77bcf86cd799439011/deactivate \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

### 5. Get Category Statistics

**GET** `/api/categories/admin/:id/stats`

Retrieves detailed usage statistics for a specific category.

**Response (200 OK):**
```json
{
  "status": "success",
  "category": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "plumbing-repair",
    "displayName": "Plumbing Repair"
  },
  "stats": {
    "totalTasks": 15,
    "totalTaskers": 8,
    "recentTasks": [
      {
        "_id": "507f1f77bcf86cd799439013",
        "title": "Fix Kitchen Sink Leak",
        "createdAt": "2023-12-07T09:00:00.000Z",
        "status": "open"
      }
    ]
  }
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3000/api/categories/admin/507f1f77bcf86cd799439011/stats \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

## JavaScript Functions

### Admin Category Management

```javascript
class AdminCategoryAPI {
  constructor(baseURL, authToken) {
    this.baseURL = baseURL;
    this.authToken = authToken;
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    };
  }

  async createCategory(categoryData) {
    const response = await fetch(`${this.baseURL}/api/categories/admin`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(categoryData)
    });
    return await response.json();
  }

  async getAllCategories(showInactive = false) {
    const url = `${this.baseURL}/api/categories/admin/all${showInactive ? '?showInactive=true' : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers
    });
    return await response.json();
  }

  async updateCategory(categoryId, updateData) {
    const response = await fetch(`${this.baseURL}/api/categories/admin/${categoryId}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(updateData)
    });
    return await response.json();
  }

  async deactivateCategory(categoryId) {
    const response = await fetch(`${this.baseURL}/api/categories/admin/${categoryId}/deactivate`, {
      method: 'PATCH',
      headers: this.headers
    });
    return await response.json();
  }

  async getCategoryStats(categoryId) {
    const response = await fetch(`${this.baseURL}/api/categories/admin/${categoryId}/stats`, {
      method: 'GET',
      headers: this.headers
    });
    return await response.json();
  }
}

// Usage example
const adminAPI = new AdminCategoryAPI('http://localhost:3000', 'your-admin-jwt-token');

// Create a new category
const newCategory = await adminAPI.createCategory({
  name: 'electrical-work',
  displayName: 'Electrical Work',
  description: 'Professional electrical services and repairs'
});

// Get all categories including inactive ones
const allCategories = await adminAPI.getAllCategories(true);

// Update a category
const updatedCategory = await adminAPI.updateCategory('507f1f77bcf86cd799439011', {
  description: 'Updated description for the category'
});

// Get category statistics
const stats = await adminAPI.getCategoryStats('507f1f77bcf86cd799439011');
```

## React Hooks

### useAdminCategories Hook

```javascript
import { useState, useEffect, useCallback } from 'react';

export const useAdminCategories = (authToken) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const api = new AdminCategoryAPI('http://localhost:3000', authToken);

  const fetchCategories = useCallback(async (showInactive = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAllCategories(showInactive);
      if (result.status === 'success') {
        setCategories(result.categories);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  const createCategory = useCallback(async (categoryData) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.createCategory(categoryData);
      if (result.status === 'success') {
        setCategories(prev => [...prev, result.category]);
        return result;
      } else {
        setError(result.message);
        return result;
      }
    } catch (err) {
      setError('Failed to create category');
      return { status: 'error', message: 'Failed to create category' };
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  const updateCategory = useCallback(async (categoryId, updateData) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.updateCategory(categoryId, updateData);
      if (result.status === 'success') {
        setCategories(prev => 
          prev.map(cat => cat._id === categoryId ? result.category : cat)
        );
        return result;
      } else {
        setError(result.message);
        return result;
      }
    } catch (err) {
      setError('Failed to update category');
      return { status: 'error', message: 'Failed to update category' };
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  const deactivateCategory = useCallback(async (categoryId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.deactivateCategory(categoryId);
      if (result.status === 'success') {
        setCategories(prev => 
          prev.map(cat => cat._id === categoryId ? { ...cat, isActive: false } : cat)
        );
        return result;
      } else {
        setError(result.message);
        return result;
      }
    } catch (err) {
      setError('Failed to deactivate category');
      return { status: 'error', message: 'Failed to deactivate category' };
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deactivateCategory
  };
};
```

## Error Handling

### Common Error Responses

**401 Unauthorized:**
```json
{
  "status": "error",
  "message": "Access denied. Admin privileges required."
}
```

**400 Bad Request:**
```json
{
  "status": "error",
  "message": "Category name and display name are required"
}
```

**404 Not Found:**
```json
{
  "status": "error",
  "message": "Category not found"
}
```

**409 Conflict:**
```json
{
  "status": "error",
  "message": "Category with this name already exists"
}
```

## Migration Notes

When migrating from the old string-based category system to the new ObjectId-based system:

1. **Backup your data** before running any migration scripts
2. **Create categories first** using the admin endpoints
3. **Update existing tasks and taskers** to reference the new category ObjectIds
4. **Test thoroughly** to ensure all category references are working correctly

The system is designed to be backward compatible during the transition period, but it's recommended to complete the migration as soon as possible for optimal performance and consistency. 