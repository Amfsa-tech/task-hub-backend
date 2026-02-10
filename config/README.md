# Database Configuration

This directory contains the database configuration for the TaskHub server.

## Files

### `database.js`
Contains the main database connection logic with the following exports:

- **`connectDB()`** - Establishes connection to MongoDB with optimized settings
- **`disconnectDB()`** - Gracefully disconnects from MongoDB
- **`setupConnectionHandlers()`** - Sets up connection event handlers and graceful shutdown

### `envConfig.js`
Environment variable configuration including:
- `PORT` - Server port
- `NODE_ENV` - Environment mode
- `MONGO_URI` - MongoDB connection string

### `index.js`
Central export file for clean imports across the application.

## Usage

```javascript
import { connectDB, setupConnectionHandlers, PORT } from './config/index.js';

// Setup connection handlers
setupConnectionHandlers();

// Connect to database
await connectDB();
```

## Environment Variables

Ensure your `.env` file contains:

```env
MONGO_URI=mongodb://localhost:27017/taskhub
PORT=3009
NODE_ENV=development
```

## Features

- **Connection Pooling**: Optimized connection settings for production
- **Error Handling**: Comprehensive error handling and logging
- **Graceful Shutdown**: Proper cleanup on application termination
- **Connection Events**: Detailed logging of connection states
- **Retry Logic**: Built-in retry mechanisms for connection failures
