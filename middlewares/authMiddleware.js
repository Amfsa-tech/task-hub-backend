import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import { JWT_SECRET } from '../utils/authUtils.js';

// ==========================================
// 1. PROTECT USER (Clients Only)
// ==========================================
export const protectUser = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ status: "error", message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ status: "error", message: 'Invalid token. User not found.' });
    }

    if (!user.isActive) return res.status(401).json({ status: "error", message: 'Account has been deactivated.' });
    if (user.isLocked) return res.status(401).json({ status: "error", message: 'Account is temporarily locked.' });

    req.user = user;
    req.userType = 'user';
    Sentry.setUser({ id: user._id.toString(), userType: 'user' });
    next();
  } catch (err) {
    return res.status(401).json({ status: "error", message: err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.' });
  }
};

// ==========================================
// 2. PROTECT TASKER (Freelancers Only)
// ==========================================
export const protectTasker = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ status: "error", message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const tasker = await Tasker.findById(decoded.id);

    if (!tasker) {
      return res.status(401).json({ status: "error", message: 'Invalid token. Tasker not found.' });
    }

    if (!tasker.isActive) return res.status(401).json({ status: "error", message: 'Account has been deactivated.' });
    if (tasker.isLocked) return res.status(401).json({ status: "error", message: 'Account is temporarily locked.' });

    req.user = tasker; // Note: We still use req.user for consistency in common controllers
    req.tasker = tasker; // Extra layer for tasker-specific logic
    req.userType = 'tasker';
    Sentry.setUser({ id: tasker._id.toString(), userType: 'tasker' });
    next();
  } catch (err) {
    return res.status(401).json({ status: "error", message: err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.' });
  }
};

// ==========================================
// 3. PROTECT ANY (Universal - Best for Wallet/Notifications)
// ==========================================
export const protectAny = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ status: "error", message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attempt to find in both collections
    let account = await User.findById(decoded.id);
    let type = 'user';

    if (!account) {
      account = await Tasker.findById(decoded.id);
      type = 'tasker';
    }

    if (!account) {
      return res.status(401).json({ status: "error", message: 'Invalid token. Account not found.' });
    }

    if (!account.isActive) return res.status(401).json({ status: "error", message: 'Account has been deactivated.' });
    if (account.isLocked) return res.status(401).json({ status: "error", message: 'Account is temporarily locked.' });

    req.user = account;
    req.userType = type;
    Sentry.setUser({ id: account._id.toString(), userType: type });
    next();
  } catch (err) {
    return res.status(401).json({ status: "error", message: err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.' });
  }
};

// ==========================================
// 4. OPTIONAL & VERIFICATION HELPERS
// ==========================================
export const requireEmailVerification = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      status: "error",
      message: 'Email verification required.',
      emailVerificationRequired: true
    });
  }
  next();
};

export const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    let account = await User.findById(decoded.id) || await Tasker.findById(decoded.id);
    
    if (account && account.isActive && !account.isLocked) {
      req.user = account;
      req.userType = account.constructor.modelName.toLowerCase();
      Sentry.setUser({ id: account._id.toString(), userType: req.userType });
    }
    next();
  } catch (err) {
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