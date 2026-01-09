# Unified Bidding System Documentation

## Overview

The TaskHub application now uses a **unified bidding system** that handles both bidding-enabled and bidding-disabled tasks through a single API interface. This eliminates the need for separate application systems while providing a seamless experience for both taskers and users.

## How It Works

### For Tasks with Bidding Enabled (`isBiddingEnabled: true`)
- **Tasker Experience**: Can set their own custom price when applying
- **User Experience**: Sees multiple bids with different prices, can choose the best one
- **Bid Type**: `custom`
- **Price Source**: Tasker-specified amount

### For Tasks with Bidding Disabled (`isBiddingEnabled: false`)
- **Tasker Experience**: Applies directly (price input hidden on client)
- **User Experience**: Sees applications at the fixed task budget price
- **Bid Type**: `fixed`
- **Price Source**: Task's budget amount

## API Changes

### 1. Bid Model Updates

**New Field Added:**
```javascript
bidType: {
    type: String,
    enum: ['custom', 'fixed'],
    default: 'custom'
}
```

### 2. Create Bid Endpoint (`POST /api/bids`)

**Enhanced Logic:**
- **Bidding Enabled**: Requires `amount` in request body, validates amount
- **Bidding Disabled**: Uses task's budget as amount, `amount` in request body is optional/ignored
- **Response**: Includes `bidType` and `taskBiddingEnabled` information

**Request Examples:**

*For Bidding-Enabled Task:*
```json
{
    "taskId": "507f1f77bcf86cd799439011",
    "amount": 150,
    "message": "I can complete this task efficiently"
}
```

*For Bidding-Disabled Task:*
```json
{
    "taskId": "507f1f77bcf86cd799439012",
    "message": "I'm available to help with this task"
}
```

**Response:**
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
        "bidType": "custom", // or "fixed"
        "status": "pending",
        "createdAt": "2023-12-07T10:00:00.000Z",
        "taskBiddingEnabled": true
    }
}
```

### 3. Update Bid Endpoint (`PUT /api/bids/:id`)

**Enhanced Logic:**
- **Custom Bids**: Can update both amount and message
- **Fixed Bids**: Can only update message (amount updates are blocked)

**Error for Fixed Bid Amount Update:**
```json
{
    "status": "error",
    "message": "Cannot update amount for fixed-price applications",
    "details": "This task has a fixed budget and doesn't allow custom pricing"
}
```

### 4. Get Task Bids Endpoint (`GET /api/bids/task/:taskId`)

**Enhanced Response:**
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
                "profilePicture": ""
            },
            "amount": 150,
            "message": "I can complete this efficiently",
            "bidType": "custom",
            "status": "pending",
            "createdAt": "2023-12-07T10:00:00.000Z",
            "bidTypeLabel": "Custom Bid",
            "isFixedPrice": false
        }
    ]
}
```

### 5. Tasker Feed Endpoint (`GET /api/tasks/tasker/feed`)

**Enhanced Response:**
Each task now includes `applicationInfo` to guide the client UI:

```json
{
    "status": "success",
    "tasks": [
        {
            "_id": "507f1f77bcf86cd799439011",
            "title": "Home Cleaning Service",
            "description": "Need weekly cleaning service",
            "budget": 100,
            "isBiddingEnabled": true,
            "status": "open",
            "categories": [...],
            "user": {...},
            "taskerBidInfo": {
                "hasBid": false
            },
            "applicationInfo": {
                "canApply": true,
                "applicationMode": "bidding", // or "fixed"
                "applicationLabel": "Place Bid", // or "Apply for Task"
                "priceEditable": true, // or false
                "fixedPrice": null // or budget amount for fixed tasks
            }
        }
    ]
}
```

## Client-Side Implementation Guide

### React Example

```jsx
function TaskCard({ task }) {
    const { applicationInfo, taskerBidInfo } = task;
    const [amount, setAmount] = useState(applicationInfo.fixedPrice || '');
    const [message, setMessage] = useState('');

    const handleApply = async () => {
        const payload = {
            taskId: task._id,
            message
        };

        // Only include amount for bidding-enabled tasks
        if (applicationInfo.priceEditable) {
            payload.amount = parseFloat(amount);
        }

        try {
            const response = await fetch('/api/bids', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.status === 'success') {
                alert(result.message);
            }
        } catch (error) {
            console.error('Error applying:', error);
        }
    };

    return (
        <div className="task-card">
            <h3>{task.title}</h3>
            <p>{task.description}</p>
            <p>Budget: ${task.budget}</p>
            
            {!taskerBidInfo.hasBid ? (
                <div className="application-form">
                    {/* Show price input only for bidding-enabled tasks */}
                    {applicationInfo.priceEditable ? (
                        <div>
                            <label>Your Bid Amount:</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="Enter your bid amount"
                            />
                        </div>
                    ) : (
                        <div>
                            <p><strong>Fixed Price: ${applicationInfo.fixedPrice}</strong></p>
                        </div>
                    )}
                    
                    <div>
                        <label>Message:</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Tell the client why you're the best choice"
                        />
                    </div>
                    
                    <button onClick={handleApply}>
                        {applicationInfo.applicationLabel}
                    </button>
                </div>
            ) : (
                <p>✅ Already Applied - Amount: ${taskerBidInfo.amount}</p>
            )}
        </div>
    );
}
```

## Benefits

1. **Simplified Architecture**: Single API endpoint for all task applications
2. **Consistent User Experience**: Same interface for both bidding modes
3. **Flexible Pricing**: Supports both custom and fixed pricing models
4. **Clear Distinction**: BidType field clearly identifies the pricing model
5. **Client-Friendly**: Application info guides UI rendering decisions

## Migration Notes

- **Existing Bids**: All existing bids will have `bidType: 'custom'` by default
- **Backward Compatibility**: All existing API calls continue to work
- **Client Updates**: Clients should use `applicationInfo` to determine UI behavior
- **Database**: No migration script needed - new field has default values

## Testing

The system has been tested with:
- ✅ Bidding-enabled tasks with custom amounts
- ✅ Bidding-disabled tasks with fixed amounts  
- ✅ Bid updates (amount blocking for fixed bids)
- ✅ Tasker feed with application information
- ✅ User viewing bids with type labels

## API Endpoints Summary

| Endpoint | Method | Purpose | Changes |
|----------|--------|---------|---------|
| `/api/bids` | POST | Create bid/application | Auto-detects bidding mode |
| `/api/bids/:id` | PUT | Update bid/application | Blocks amount updates for fixed bids |
| `/api/bids/task/:taskId` | GET | Get task bids | Includes bidType labels |
| `/api/tasks/tasker/feed` | GET | Get tasker feed | Includes applicationInfo |

The unified bidding system provides a seamless experience while maintaining the flexibility to support both bidding and fixed-price task models. 