# Task API Endpoints Documentation

This document covers all API endpoints for task management in the TaskHub application with the enhanced multiple categories system.

## Table of Contents

1. [Task Creation](#task-creation)
2. [Task Retrieval](#task-retrieval)
3. [Task Management](#task-management)
4. [Code Examples](#code-examples)
5. [Error Handling](#error-handling)

---

## Task Creation

### 1. Create Task with Multiple Categories

**Endpoint:** `POST /api/tasks`

**Description:** Create a new task with one or more categories. Users can select multiple categories to increase the chances of finding suitable taskers.

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Home Renovation Project",
  "description": "I need comprehensive home renovation including plumbing repairs, electrical work, and general handyman services. The bathroom needs new fixtures, kitchen needs electrical outlet installation, and several doors need repair.",
  "categories": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012", 
    "507f1f77bcf86cd799439013"
  ],
  "tags": ["urgent", "multiple-rooms", "experienced-only"],
  "images": [
    {
      "url": "https://example.com/bathroom.jpg"
    },
    {
      "url": "https://example.com/kitchen.jpg"
    }
  ],
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "budget": 1500,
  "isBiddingEnabled": true,
  "deadline": "2024-01-15T00:00:00.000Z"
}
```

**Field Descriptions:**
- `categories` (required): Array of category ObjectIds (minimum 1, maximum recommended: 5)
- `title` (required): Task title (max 200 characters)
- `description` (required): Detailed task description
- `location` (required): Latitude and longitude coordinates
- `budget` (required): Budget amount in dollars
- `tags` (optional): Array of custom tags for additional filtering
- `images` (optional): Array of image URLs for task visualization
- `isBiddingEnabled` (optional): Allow taskers to bid (default: false)
- `deadline` (optional): Task completion deadline

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Task created successfully",
  "task": {
    "_id": "507f1f77bcf86cd799439014",
    "title": "Home Renovation Project",
    "description": "I need comprehensive home renovation...",
    "categories": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "plumbing-repair",
        "displayName": "Plumbing Repair",
        "description": "Professional plumbing services including repairs, installations, and maintenance"
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "name": "electrical-work",
        "displayName": "Electrical Work",
        "description": "Licensed electrical services for homes and businesses"
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "name": "handyman-services",
        "displayName": "Handyman Services",
        "description": "General repair and maintenance services"
      }
    ],
    "tags": ["urgent", "multiple-rooms", "experienced-only"],
    "images": [
      {
        "url": "https://example.com/bathroom.jpg",
        "_id": "507f1f77bcf86cd799439015"
      },
      {
        "url": "https://example.com/kitchen.jpg",
        "_id": "507f1f77bcf86cd799439016"
      }
    ],
    "location": {
      "latitude": 40.7128,
      "longitude": -74.0060
    },
    "budget": 1500,
    "isBiddingEnabled": true,
    "deadline": "2024-01-15T00:00:00.000Z",
    "status": "open",
    "user": "507f1f77bcf86cd799439010",
    "createdAt": "2023-12-07T14:30:00.000Z",
    "updatedAt": "2023-12-07T14:30:00.000Z"
  }
}
```

**Error Responses:**

**400 - Missing Required Fields:**
```json
{
  "status": "error",
  "message": "Missing required fields",
  "missingFields": ["categories", "budget"]
}
```

**400 - Invalid Categories:**
```json
{
  "status": "error",
  "message": "At least one category is required",
  "details": "Categories must be a non-empty array of category IDs"
}
```

**400 - Invalid Category IDs:**
```json
{
  "status": "error",
  "message": "Some categories not found or inactive",
  "details": "Invalid category IDs: 507f1f77bcf86cd799439017, 507f1f77bcf86cd799439018"
}
```

---

## Task Retrieval

### 2. Get All Tasks with Category Filtering

**Endpoint:** `GET /api/tasks`

**Description:** Retrieve all tasks with optional filtering by categories, status, and pagination

**Query Parameters:**
- `categories` (optional): Array of category IDs to filter by
- `status` (optional): Task status (open, assigned, in-progress, completed, cancelled)
- `isBiddingEnabled` (optional): Filter by bidding enabled (true/false)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Examples:**

**Get all tasks:**
```
GET /api/tasks
```

**Filter by multiple categories:**
```
GET /api/tasks?categories=507f1f77bcf86cd799439011&categories=507f1f77bcf86cd799439012
```

**Filter by status and enable bidding:**
```
GET /api/tasks?status=open&isBiddingEnabled=true
```

**Success Response (200):**
```json
{
  "status": "success",
  "count": 2,
  "totalPages": 1,
  "currentPage": 1,
  "tasks": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "title": "Home Renovation Project",
      "description": "I need comprehensive home renovation...",
      "categories": [
        {
          "_id": "507f1f77bcf86cd799439011",
          "name": "plumbing-repair",
          "displayName": "Plumbing Repair",
          "description": "Professional plumbing services"
        }
      ],
      "budget": 1500,
      "status": "open",
      "user": {
        "_id": "507f1f77bcf86cd799439010",
        "fullName": "John Doe",
        "profilePicture": ""
      },
      "createdAt": "2023-12-07T14:30:00.000Z"
    }
  ]
}
```

### 3. Get Task by ID

**Endpoint:** `GET /api/tasks/:id`

**Description:** Get detailed information about a specific task

**Success Response (200):**
```json
{
  "status": "success",
  "task": {
    "_id": "507f1f77bcf86cd799439014",
    "title": "Home Renovation Project",
    "description": "I need comprehensive home renovation...",
    "categories": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "plumbing-repair",
        "displayName": "Plumbing Repair",
        "description": "Professional plumbing services including repairs, installations, and maintenance"
      }
    ],
    "tags": ["urgent", "multiple-rooms"],
    "images": [],
    "location": {
      "latitude": 40.7128,
      "longitude": -74.0060
    },
    "budget": 1500,
    "isBiddingEnabled": true,
    "deadline": "2024-01-15T00:00:00.000Z",
    "status": "open",
    "user": {
      "_id": "507f1f77bcf86cd799439010",
      "fullName": "John Doe",
      "profilePicture": ""
    },
    "assignedTasker": null,
    "createdAt": "2023-12-07T14:30:00.000Z",
    "updatedAt": "2023-12-07T14:30:00.000Z"
  }
}
```

### 4. Get User's Tasks

**Endpoint:** `GET /api/tasks/user/tasks`

**Description:** Get all tasks created by the current user

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `status` (optional): Filter by task status
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Success Response (200):**
```json
{
  "status": "success",
  "count": 3,
  "totalPages": 1,
  "currentPage": 1,
  "tasks": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "title": "Home Renovation Project",
      "categories": [
        {
          "_id": "507f1f77bcf86cd799439011",
          "name": "plumbing-repair",
          "displayName": "Plumbing Repair"
        }
      ],
      "budget": 1500,
      "status": "open",
      "assignedTasker": null,
      "createdAt": "2023-12-07T14:30:00.000Z"
    }
  ]
}
```

---

## Task Management

### 5. Update Task Status

**Endpoint:** `PATCH /api/tasks/:id/status`

**Description:** Update task status (user or assigned tasker only)

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "status": "in-progress"
}
```

**Valid Status Values:**
- `open` - Task is available for taskers
- `assigned` - Task has been assigned to a tasker
- `in-progress` - Work has started
- `completed` - Task is finished
- `cancelled` - Task has been cancelled

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Task status updated successfully",
  "task": {
    "_id": "507f1f77bcf86cd799439014",
    "status": "in-progress",
    "updatedAt": "2023-12-07T15:30:00.000Z"
  }
}
```

### 6. Delete Task

**Endpoint:** `DELETE /api/tasks/:id`

**Description:** Delete a task (creator only, only if status is 'open')

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Task deleted successfully"
}
```

---

## Code Examples

### JavaScript/Node.js Example

```javascript
// Task creation with multiple categories
async function createMultiCategoryTask(token, taskData) {
  try {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: taskData.title,
        description: taskData.description,
        categories: taskData.categoryIds, // Array of ObjectIds
        location: {
          latitude: taskData.lat,
          longitude: taskData.lng
        },
        budget: taskData.budget,
        isBiddingEnabled: taskData.allowBidding || false,
        tags: taskData.tags || [],
        images: taskData.images || []
      })
    });

    const result = await response.json();
    
    if (result.status === 'success') {
      console.log('Task created successfully:', result.task);
      console.log('Categories selected:', result.task.categories.length);
      console.log('Category names:', result.task.categories.map(cat => cat.displayName).join(', '));
      return result.task;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

// Usage example
const taskData = {
  title: "Bathroom Renovation",
  description: "Complete bathroom renovation including plumbing and tiling",
  categoryIds: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439019"], // plumbing + tiling
  lat: 40.7128,
  lng: -74.0060,
  budget: 2000,
  allowBidding: true,
  tags: ["bathroom", "renovation", "urgent"]
};

createMultiCategoryTask(userToken, taskData);
```

### React Hook Example

```javascript
import { useState, useEffect } from 'react';

export function useTaskCreation() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch available categories
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        setCategories(data.categories || []);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    }
    fetchCategories();
  }, []);

  const createTask = async (taskData, selectedCategoryIds) => {
    setLoading(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...taskData,
          categories: selectedCategoryIds
        })
      });

      const result = await response.json();
      
      if (result.status === 'success') {
        return result.task;
      } else {
        throw new Error(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    categories,
    createTask,
    loading
  };
}
```

### Category Selection Component

```javascript
import React, { useState } from 'react';

export function CategorySelector({ categories, selectedCategories, onSelectionChange, maxSelection = 5 }) {
  const [selected, setSelected] = useState(selectedCategories || []);

  const handleCategoryToggle = (categoryId) => {
    const newSelected = selected.includes(categoryId)
      ? selected.filter(id => id !== categoryId)
      : selected.length < maxSelection 
        ? [...selected, categoryId]
        : selected;
    
    setSelected(newSelected);
    onSelectionChange(newSelected);
  };

  return (
    <div className="category-selector">
      <h3>Select Categories (Select up to {maxSelection})</h3>
      <p className="help-text">
        Selecting multiple categories increases your chances of finding qualified taskers.
      </p>
      
      <div className="categories-grid">
        {categories.map(category => (
          <div 
            key={category._id}
            className={`category-card ${selected.includes(category._id) ? 'selected' : ''}`}
            onClick={() => handleCategoryToggle(category._id)}
          >
            <h4>{category.displayName}</h4>
            <p>{category.description}</p>
            {selected.includes(category._id) && <span className="check-icon">✓</span>}
          </div>
        ))}
      </div>
      
      <div className="selection-summary">
        Selected: {selected.length} of {maxSelection} categories
      </div>
    </div>
  );
}
```

---

## Error Handling

### Common Error Scenarios

**1. No Categories Selected:**
```json
{
  "status": "error",
  "message": "At least one category is required",
  "details": "Categories must be a non-empty array of category IDs"
}
```

**2. Invalid Category ID Format:**
```json
{
  "status": "error",
  "message": "Invalid category ID format at index 1",
  "details": "All category IDs must be valid ObjectId strings"
}
```

**3. Inactive Categories:**
```json
{
  "status": "error",
  "message": "Some categories not found or inactive",
  "details": "Invalid category IDs: 507f1f77bcf86cd799439017"
}
```

**4. Budget Validation:**
```json
{
  "status": "error",
  "message": "Invalid budget value",
  "details": "Budget must be a positive number"
}
```

**5. Location Validation:**
```json
{
  "status": "error",
  "message": "Invalid location coordinates",
  "details": "Latitude and longitude must be valid numbers"
}
```

### Error Handling Best Practices

1. **Always validate categories client-side** before sending requests
2. **Show clear error messages** to users about category selection
3. **Implement retry logic** for network failures
4. **Cache category data** to reduce API calls
5. **Provide fallback options** when categories fail to load

---

## Smart Matching & Notifications

When a task is created with multiple categories, the system automatically:

1. **Finds all taskers** who have ANY of the selected categories
2. **Sends notifications** to matching taskers
3. **Logs detailed matching info** for analytics
4. **Increases task visibility** across multiple category groups

### Example Notification Log
```
📧 Notification: Tasker John Smith (john@example.com) - 
New "Plumbing Repair, Handyman Services" task available: "Bathroom Renovation" 
(matches: Plumbing Repair, Handyman Services)
```

This multiple categories system significantly improves task-to-tasker matching efficiency and increases the likelihood of successful task completion. 