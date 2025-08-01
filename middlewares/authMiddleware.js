// Add this after other middleware but before routes
import verify from 'jsonwebtoken';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import { JWT_SECRET } from '../utils/authUtils.js';

 export const protectUser = async (req, res, next) => {
  let token;
  
  // Get token from headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: "error",  
      message: 'Access denied. No token provided.'
    });
  }

  try {
    // Verify token
    const decoded = verify(token, JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        status: "error",  
        message: 'Invalid token. User not found.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        status: "error",
        message: 'Account has been deactivated.'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(401).json({
        status: "error",
        message: 'Account is temporarily locked due to too many failed login attempts.'
      });
    }
    
    // Attach user to request object
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: "error", 
        message: 'Invalid token.'
      });
    } else {
      return res.status(401).json({
        status: "error", 
        message: 'Token verification failed.'
      });
    }
  }
};

export const protectTasker = async (req, res, next) => {
  let token;
  
  // Get token from headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: "error",  
      message: 'Access denied. No token provided.'
    });
  }

  try {
    // Verify token
    const decoded = verify(token, JWT_SECRET);
    
    // Get tasker from database
    const tasker = await Tasker.findById(decoded.id);
    if (!tasker) {
      return res.status(401).json({
        status: "error",  
        message: 'Invalid token. Tasker not found.'
      });
    }

    // Check if account is active
    if (!tasker.isActive) {
      return res.status(401).json({
        status: "error",
        message: 'Account has been deactivated.'
      });
    }

    // Check if account is locked
    if (tasker.isLocked) {
      return res.status(401).json({
        status: "error",
        message: 'Account is temporarily locked due to too many failed login attempts.'
      });
    }
    
    // Attach tasker to request object
    req.tasker = tasker;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: "error", 
        message: 'Invalid token.'
      });
    } else {
      return res.status(401).json({
        status: "error", 
        message: 'Token verification failed.'
      });
    }
  }
};

// Middleware to check if email is verified (optional - can be applied to specific routes)
export const requireEmailVerification = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      status: "error",
      message: 'Email verification required. Please verify your email to access this feature.',
      emailVerificationRequired: true
    });
  }
  next();
};

// Middleware that works for both users and taskers
export const protectAny = async (req, res, next) => {
  let token;
  
  // Get token from headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: "error",  
      message: 'Access denied. No token provided.'
    });
  }

  try {
    // Verify token
    const decoded = verify(token, JWT_SECRET);
    
    // Try to find user first, then tasker
    let user = await User.findById(decoded.id);
    let userType = 'user';
    
    if (!user) {
      user = await Tasker.findById(decoded.id);
      userType = 'tasker';
    }
    
    if (!user) {
      return res.status(401).json({
        status: "error",  
        message: 'Invalid token. User not found.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        status: "error",
        message: 'Account has been deactivated.'
      });
    }
    
    // Check if account is locked
    if (user.isLocked) {
      return res.status(401).json({
        status: "error",
        message: 'Account is temporarily locked due to too many failed login attempts.'
      });
    }
    
    // Attach user and type to request object
    req.user = user;
    req.userType = userType;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: "error", 
        message: 'Invalid token.'
      });
    } else {
      return res.status(401).json({
        status: "error", 
        message: 'Token verification failed.'
      });
    }
  }
};

// Optional middleware for routes that don't require authentication but can benefit from it
export const optionalAuth = async (req, res, next) => {
  let token;
  
  // Get token from headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // If no token, continue without authentication
  if (!token) {
    return next();
  }

  try {
    // Verify token
    const decoded = verify(token, JWT_SECRET);
    
    // Try to find user first, then tasker
    let user = await User.findById(decoded.id);
    let userType = 'user';
    
    if (!user) {
      user = await Tasker.findById(decoded.id);
      userType = 'tasker';
    }
    
    // If user exists and is active, attach to request
    if (user && user.isActive && !user.isLocked) {
      req.user = user;
      req.userType = userType;
    }
    
    next();
  } catch (err) {
    // Continue without authentication if token is invalid
    next();
  }
};

export default {
    protectUser,
    protectTasker,
    protectAny,
    requireEmailVerification,
    optionalAuth
};