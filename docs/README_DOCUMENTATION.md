# TaskHub API Documentation

## Documentation Structure

The TaskHub API documentation is organized into specialized files for better organization and easier navigation:

## 📚 **Authentication Documentation**

### **[API_USER_ENDPOINTS.md](./API_USER_ENDPOINTS.md)**
**User-Specific Features**
- User registration and login
- User profile management  
- Account management for regular users
- Code examples and React hooks for users

### **[API_TASKER_ENDPOINTS.md](./API_TASKER_ENDPOINTS.md)**
**Tasker-Specific Features**
- Tasker registration and login
- Tasker profile management
- Categories management system
- Identity verification features
- Code examples and React hooks for taskers

### **[API_AUTH_ENDPOINTS.md](./API_AUTH_ENDPOINTS.md)**
**Shared Authentication Features**
- Email verification (works for both users and taskers)
- Password reset functionality
- Common authentication headers and error handling

### **[API_ADMIN_ENDPOINTS.md](./API_ADMIN_ENDPOINTS.md)**
**Admin Platform Management**
- Category creation and management
- Category usage statistics and analytics
- Admin-only endpoints with proper authorization
- Platform administration tools

### **[AUTH_FEATURES.md](./AUTH_FEATURES.md)**
**Technical Implementation Details**
- Database schema changes
- Security features and middleware
- Email configuration
- Best practices and usage examples

---

## 🚀 **Quick Start Guide**

### For Users:
1. See [API_USER_ENDPOINTS.md](./API_USER_ENDPOINTS.md) for user registration and management
2. Check [API_AUTH_ENDPOINTS.md](./API_AUTH_ENDPOINTS.md) for email verification and password reset

### For Taskers:
1. See [API_TASKER_ENDPOINTS.md](./API_TASKER_ENDPOINTS.md) for tasker registration and management
2. Use the categories system to specify service types
3. Check [API_AUTH_ENDPOINTS.md](./API_AUTH_ENDPOINTS.md) for email verification and password reset

### For Admins:
1. See [API_ADMIN_ENDPOINTS.md](./API_ADMIN_ENDPOINTS.md) for category management and platform administration
2. Use admin endpoints to create and manage service categories
3. Monitor category usage statistics and platform health

### For Developers:
1. Review [AUTH_FEATURES.md](./AUTH_FEATURES.md) for implementation details
2. Check individual endpoint files for specific integration examples
3. Use the provided React hooks and JavaScript functions for frontend integration

---

## 📋 **Feature Overview**

### **User Features**
- ✅ Registration with email verification
- ✅ Login with JWT authentication
- ✅ Profile management
- ✅ Password reset and change
- ✅ Account deactivation
- ✅ Wallet system for payments

### **Tasker Features**
- ✅ Registration with email verification
- ✅ Login with JWT authentication
- ✅ Profile management
- ✅ **Categories management system** (NEW)
- ✅ Identity verification tracking
- ✅ Password reset and change
- ✅ Account deactivation
- ✅ Wallet system for earnings

### **Admin Features**
- ✅ **Enhanced category management system** (NEW)
- ✅ Create and manage service categories
- ✅ Category usage statistics and analytics
- ✅ Safe category deactivation (prevents deletion if in use)
- ✅ Admin-only authentication and authorization
- ✅ Platform health monitoring tools

### **Shared Features**
- ✅ Email verification with 5-digit codes
- ✅ Password reset with secure tokens
- ✅ Account lockout protection
- ✅ JWT token authentication
- ✅ Professional email templates

---

## 🔗 **Base URL**
```
http://localhost:3009/api/auth
```

## 🛡️ **Security Features**
- Account lockout after 5 failed attempts
- JWT tokens with proper expiration
- Password hashing with bcrypt
- Email verification required
- Rate limiting protection

---

Choose the appropriate documentation file based on your needs and user type! 