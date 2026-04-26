import User from "../models/user.js";
import Tasker from "../models/tasker.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";
import Category from "../models/category.js";
import University from "../models/university.js";
import KYCVerification from "../models/kycVerification.js";
import { uploadMultipleToCloudinary } from "../utils/uploadService.js";
import { logActivity } from '../utils/activityLogger.js';
import {
  generateToken,
  generateRandomToken,
  generatePasswordResetCode,
  hashToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  MAX_LOGIN_ATTEMPTS,
  LOCK_TIME,
} from "../utils/authUtils.js";
import { verifyGoogleToken } from "../services/googleAuthService.js";
import * as Sentry from '@sentry/node';

// Helper to calculate exact age
const calculateAge = (dobString) => {
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    
    // If the birth month hasn't happened yet this year, or it's the birth month but the day hasn't happened, subtract 1
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age;
};

// Helper function to handle login attempts and account locking
const handleLoginAttempt = async (user, isValidPassword) => {
  // If password is correct and account is not locked
  if (isValidPassword && !user.isLocked) {
    // Reset login attempts if there were any
    if (user.loginAttempts > 0) {
      await user.updateOne({
        $unset: { loginAttempts: 1, lockUntil: 1 },
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    return { success: true };
  }

  // If account is locked
  if (user.isLocked) {
    return {
      success: false,
      message:
        "Account temporarily locked due to too many failed login attempts. Try again later.",
    };
  }

  // If password is incorrect
  if (!isValidPassword) {
    user.loginAttempts += 1;

    // Lock account if max attempts reached
    if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = Date.now() + LOCK_TIME;
    }

    await user.save();

    const attemptsLeft = MAX_LOGIN_ATTEMPTS - user.loginAttempts;
    if (attemptsLeft > 0) {
      return {
        success: false,
        message: `Invalid credentials. ${attemptsLeft} attempts remaining.`,
      };
    } else {
      return {
        success: false,
        message:
          "Account temporarily locked due to too many failed login attempts.",
      };
    }
  }
};

export const userRegister = async (req, res) => {
  const {
    fullName,
    emailAddress,
    phoneNumber,
    country,
    residentState,
    address,
    password,
    dateOfBirth,
  } = req.body;

  // Check for required fields
  const requiredFields = {
    fullName,
    emailAddress,
    phoneNumber,
    country,
    residentState,
    address,
    password,
    dateOfBirth,
  };

  const missingFields = [];
  for (const [field, value] of Object.entries(requiredFields)) {
    if (!value) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Missing required fields",
      missingFields: missingFields,
    });
  }

   // --- AGE CHECK ---
  if (calculateAge(dateOfBirth) < 16) {
    return res.status(400).json({
      status: "error",
      message: "You must be at least 16 years old to register on TaskHub.",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const existingUser = await User.findOne({ emailAddress });
    if (existingUser) {
      return res
        .status(400)
        .json({ status: "error", message: "Email is already in use" });
    }

    const existingPhoneNumber = await User.findOne({
      phoneNumber: phoneNumber,
    });
    if (existingPhoneNumber) {
      return res
        .status(400)
        .json({ status: "error", message: "Phone number is already in use" });
    }

    // Generate email verification token
    const emailToken = generateRandomToken();

    const user = new User({
      fullName,
      emailAddress,
      phoneNumber,
      country,
      residentState,
      address,
      password: hashedPassword,
      userType: "User",
      wallet: 0,
      dateOfBirth,
      emailVerificationToken: hashToken(emailToken),
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });
    await user.save();

    // --- ACTIVITY LOG: REGISTRATION ---
    // FIX: Attach directly to the existing req object
    req.user = { _id: user._id };
    req.userType = 'user';
    await logActivity(req, 'REGISTER_SUCCESS', { email: emailAddress });

    // Send verification email
    try {
      await sendVerificationEmail(emailAddress, emailToken, "user");
    } catch (emailError) {
      console.log("Email sending failed:", emailError.message);
    }

    res.status(201).json({
      status: "success",
      message:
        "User registered successfully. Please check your email to verify your account.",
      emailVerificationRequired: true,
      emailToken: emailToken,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      status: "error",
      message: "Error registering user",
      error: error.message,
    });
  }
};

export const userLogin = async (req, res) => {
  const { emailAddress, password } = req.body;

  if (!emailAddress || !password) {
    return res.status(400).json({
      status: "error",
      message: "Email and password are required",
    });
  }

  try {
    const user = await User.findOne({ emailAddress });
    if (!user) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(400).json({
        status: "error",
        message: "Account has been deactivated. Please contact support.",
      });
    }

    const isValid = await bcrypt.compare(password, user.password);
    const loginResult = await handleLoginAttempt(user, isValid);

    if (!loginResult.success) {
        // --- ACTIVITY LOG: LOGIN FAILED ---
        // FIX: Attach directly to req instead of using { ...req }
        req.user = { _id: user._id };
        req.userType = 'user';
        
        await logActivity(
            req, 
            'LOGIN_FAILED', 
            { reason: loginResult.message }, 
            'failed'
        );
      
        return res.status(400).json({
            status: "error",
            message: loginResult.message,
        });
    }

    const token = generateToken(user._id);

    // --- ACTIVITY LOG: LOGIN SUCCESS ---
    // FIX: Attach directly to req instead of using { ...req }
    req.user = user;
    req.userType = 'user';
    await logActivity(req, 'LOGIN_SUCCESS');

    return res.status(200).json({
      status: "success",
      token,
      user_type: "user",
      isEmailVerified: user.isEmailVerified,
      expiresIn: "24h",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error logging in",
      error: error.message,
    });
  }
};

export const getUser = async (req, res) => {
  try {
    // Note: We typically don't log 'GET_USER' as it happens too frequently (every page load)
    // and would bloat the database. We log the 'Login' which covers the session start.
    const userInfo = {
      _id: req.user._id,
      fullName: req.user.fullName,
      emailAddress: req.user.emailAddress,
      phoneNumber: req.user.phoneNumber,
      dateOfBirth: req.user.dateOfBirth,
      profilePicture: req.user.profilePicture,
      country: req.user.country,
      residentState: req.user.residentState,
      address: req.user.address,
      wallet: req.user.wallet,
      isEmailVerified: req.user.isEmailVerified,
      isKYCVerified: req.user.isKYCVerified,
      verifyIdentity: req.user.verifyIdentity,
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt,
    };

    return res.status(200).json({
      status: "success",
      message: "User fetched successfully",
      user: userInfo,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Tasker registration
export const taskerRegister = async (req, res) => {
  const {
    firstName,
    lastName,
    emailAddress,
    phoneNumber,
    country,
    residentState,
    originState,
    address,
    password,
    dateOfBirth,
  } = req.body;

  const requiredFields = {
    firstName,
    lastName,
    emailAddress,
    phoneNumber,
    country,
    residentState,
    originState,
    address,
    password,
    dateOfBirth,
  };

  const missingFields = [];
  for (const [field, value] of Object.entries(requiredFields)) {
    if (!value) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Missing required fields",
      missingFields: missingFields,
    });
  }
  
  if (calculateAge(dateOfBirth) < 16) {
    return res.status(400).json({
      status: "error",
      message: "You must be at least 16 years old to register on TaskHub.",
    });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const existingUser = await Tasker.findOne({ emailAddress });
    if (existingUser) {
      return res
        .status(400)
        .json({ status: "error", message: "Email is already in use" });
    }

    const existingPhoneNumber = await Tasker.findOne({
      phoneNumber: phoneNumber,
    });
    if (existingPhoneNumber) {
      return res
        .status(400)
        .json({ status: "error", message: "Phone number is already in use" });
    }

    const emailToken = generateRandomToken();
    const hashedEmailToken = hashToken(emailToken);

    const tasker = new Tasker({
      firstName,
      lastName,
      emailAddress,
      phoneNumber,
      dateOfBirth,
      country,
      originState,
      residentState,
      address,
      password: hashedPassword,
      wallet: 0,
      emailVerificationToken: hashedEmailToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });
    await tasker.save();
    
    // --- ACTIVITY LOG: TASKER REGISTRATION ---
    // FIX: Attach directly to the existing req object
    req.user = { _id: tasker._id };
    req.userType = 'tasker';
    await logActivity(req, 'REGISTER_SUCCESS', { email: emailAddress });
    
    try {
      await sendVerificationEmail(emailAddress, emailToken, "tasker");
    } catch (emailError) {
      console.log("Email sending failed:", emailError.message);
    }

    res.status(201).json({
      status: "success",
      message:
        "Tasker registered successfully. Please check your email to verify your account.",
      emailVerificationRequired: true,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      status: "error",
      message: "Error registering tasker",
      error: error.message,
    });
  }
};

export const taskerLogin = async (req, res) => {
  const { emailAddress, password } = req.body;

  if (!emailAddress || !password) {
    return res.status(400).json({
      status: "error",
      message: "Email and password are required",
    });
  }

  try {
    // 1. Fetch the tasker first!
    const tasker = await Tasker.findOne({ emailAddress });
    
    if (!tasker) {
      return res.status(400).json({ 
        status: "error", 
        message: "Invalid credentials" 
      });
    }

    // 2. Check if account is active
    if (!tasker.isActive) {
      return res.status(400).json({
        status: "error",
        message: "Account has been deactivated. Please contact support.",
      });
    }

    // 3. Compare password and handle attempt logic
    const isValid = await bcrypt.compare(password, tasker.password);
    const loginResult = await handleLoginAttempt(tasker, isValid);

    if (!loginResult.success) {
        // --- ACTIVITY LOG: LOGIN FAILED ---
        // FIX: Attach to existing req object to preserve headers (like x-forwarded-for)
        req.user = { _id: tasker._id };
        req.userType = 'tasker';
        
        await logActivity(
            req, 
            'LOGIN_FAILED', 
            { reason: loginResult.message }, 
            'failed'
        );

        return res.status(400).json({
            status: "error",
            message: loginResult.message,
        });
    }

    // 4. Generate Token
    const token = generateToken(tasker._id);

    // --- ACTIVITY LOG: LOGIN SUCCESS ---
    // FIX: Attach to existing req object to preserve headers
    req.user = tasker;
    req.userType = 'tasker';
    await logActivity(req, 'LOGIN_SUCCESS');

    // 5. Send Response
    return res.status(200).json({
      status: "success",
      token,
      user_type: "tasker",
      isEmailVerified: tasker.isEmailVerified,
      expiresIn: "24h",
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      status: "error",
      message: "Error logging in",
      error: error.message,
    });
  }
};

// MODIFIED: Populates the new Category fields and University
export const getTasker = async (req, res) => {
  try {
    const tasker = await Tasker.findById(req.tasker._id)
      .populate("mainCategories", "name displayName description isActive")
      .populate("subCategories", "name displayName description isActive")
      .select(
        "-password -emailVerificationToken -passwordResetToken -loginAttempts -lockUntil"
      );

    if (!tasker) {
      return res.status(404).json({
        status: "error",
        message: "Tasker not found",
      });
    }

    const taskerInfo = {
      _id: tasker._id,
      firstName: tasker.firstName,
      lastName: tasker.lastName,
      emailAddress: tasker.emailAddress,
      phoneNumber: tasker.phoneNumber,
      dateOfBirth: tasker.dateOfBirth,
      profilePicture: tasker.profilePicture,
      country: tasker.country,
      originState: tasker.originState,
      residentState: tasker.residentState,
      address: tasker.address,
      wallet: tasker.wallet,
      location: tasker.location,
      mainCategories: tasker.mainCategories,
      subCategories: tasker.subCategories,
      university: tasker.university,
      previousWork: tasker.previousWork,
      websiteLink: tasker.websiteLink,
      isEmailVerified: tasker.isEmailVerified,
      verifyIdentity: tasker.verifyIdentity,
      isKYCVerified: tasker?.isKYCVerified,
      lastLogin: tasker.lastLogin,
      createdAt: tasker.createdAt,
    };

    return res.status(200).json({
      status: "success",
      message: "Tasker fetched successfully",
      user: taskerInfo,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

// ... Email Verification and Password reset routes remain unchanged ...
export const verifyEmail = async (req, res) => {
  const { code, emailAddress, type } = req.body;
  if (!code || !emailAddress || !type) return res.status(400).json({ status: "error", message: "Verification code, email address, and type are required" });
  try {
    const hashedCode = hashToken(code);
    const Model = type === "user" ? User : Tasker;
    const user = await Model.findOne({ emailAddress, emailVerificationToken: hashedCode, emailVerificationExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ status: "error", message: "Invalid or expired verification code" });
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    res.status(200).json({ status: "success", message: "Email verified successfully" });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error verifying email", error: error.message });
  }
};

export const resendEmailVerification = async (req, res) => {
  const { emailAddress, type } = req.body;
  if (!emailAddress || !type) return res.status(400).json({ status: "error", message: "Email address and type are required" });
  try {
    const Model = type === "user" ? User : Tasker;
    const user = await Model.findOne({ emailAddress });
    if (!user) return res.status(400).json({ status: "error", message: "User not found" });
    if (user.isEmailVerified) return res.status(400).json({ status: "error", message: "Email is already verified" });
    const emailCode = generateRandomToken();
    user.emailVerificationToken = hashToken(emailCode);
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();
    await sendVerificationEmail(emailAddress, emailCode, type);
    res.status(200).json({ status: "success", message: "Verification code sent successfully" });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error sending verification code", error: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { emailAddress, type } = req.body;
  if (!emailAddress || !type) return res.status(400).json({ status: "error", message: "Email address and type are required" });
  try {
    const Model = type === "user" ? User : Tasker;
    const user = await Model.findOne({ emailAddress });
    if (!user) return res.status(200).json({ status: "success", message: "If the email exists, a password reset link has been sent" });
    const resetCode = generatePasswordResetCode();
    user.passwordResetToken = hashToken(resetCode);
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
    await user.save();
    await sendPasswordResetEmail(emailAddress, resetCode, type);
    res.status(200).json({ status: "success", message: "If the email exists, a password reset code has been sent" });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error processing password reset request", error: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { code, newPassword, type, emailAddress } = req.body;
  
  if (!code || !newPassword || !type || !emailAddress) {
    return res.status(400).json({ status: "error", message: "Missing required fields" });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ status: "error", message: "Password must be at least 6 characters long" });
  }
  
  try {
    const Model = type === "user" ? User : Tasker;
    const user = await Model.findOne({ 
      emailAddress, 
      passwordResetToken: hashToken(code), 
      passwordResetExpires: { $gt: Date.now() } 
    });
    
    if (!user) {
      // Note: If you ever want to log failed password resets, you would 
      // need to look up the user by email first, regardless of the token, 
      // to attach their ID to the req object before calling logActivity.
      return res.status(400).json({ status: "error", message: "Invalid or expired reset code, or email address does not match" });
    }

    const hadPassword = Boolean(user.password);
    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;

    // If this is the first password on a Google-linked account, also mark
    // 'local' as an available auth provider so the account becomes dual-auth.
    if (!hadPassword) {
      const providers = Array.isArray(user.authProviders) ? user.authProviders : [];
      if (!providers.includes('local')) providers.push('local');
      user.authProviders = providers;
    }

    await user.save();

    // --- ACTIVITY LOG: PASSWORD RESET SUCCESS ---
    // FIX: Attach directly to the existing req object
    req.user = user;
    req.userType = type;
    await logActivity(req, 'PASSWORD_RESET_SUCCESS', { firstPassword: !hadPassword });

    res.status(200).json({ status: "success", message: "Password reset successfully" });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error resetting password", error: error.message });
  }
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ status: "error", message: "Current and new password are required" });
  if (newPassword.length < 6) return res.status(400).json({ status: "error", message: "New password must be at least 6 characters long" });
  
  try {
    if (!req.user.password) {
      return res.status(400).json({
        status: "error",
        code: "no_password_set",
        message: "This account has no password set. Use set-password instead.",
      });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, req.user.password);
    
    if (!isValidPassword) {
      // --- ACTIVITY LOG: FAILED CHANGE ATTEMPT ---
      await logActivity(req, 'PASSWORD_CHANGE_FAILED', { reason: 'incorrect_current_password' }, 'failed');
      return res.status(400).json({ status: "error", message: "Current password is incorrect" });
    }

    req.user.password = await bcrypt.hash(newPassword, 10);
    await req.user.save();

    // --- ACTIVITY LOG: PASSWORD CHANGE SUCCESS ---
    await logActivity(req, 'PASSWORD_CHANGE_SUCCESS');

    res.status(200).json({ status: "success", message: "Password changed successfully" });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error changing password", error: error.message });
  }
};

// Set an initial local password for an authenticated Google-only account.
// Only valid when the account currently has no password stored. Adds 'local'
// to authProviders on success.
export const setPassword = async (req, res) => {
  const { newPassword } = req.body || {};

  if (!newPassword) {
    return res.status(400).json({
      status: "error",
      code: "invalid_request",
      message: "newPassword is required",
    });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({
      status: "error",
      code: "weak_password",
      message: "Password must be at least 6 characters long",
    });
  }

  try {
    if (req.user.password) {
      return res.status(400).json({
        status: "error",
        code: "password_already_set",
        message: "A password is already set for this account. Use change-password instead.",
      });
    }

    req.user.password = await bcrypt.hash(newPassword, 10);
    const providers = Array.isArray(req.user.authProviders) ? req.user.authProviders : [];
    if (!providers.includes('local')) providers.push('local');
    req.user.authProviders = providers;
    await req.user.save();

    await logActivity(req, 'PASSWORD_SET');

    return res.status(200).json({
      status: "success",
      message: "Password set successfully. You can now sign in with email and password.",
      authProviders: req.user.authProviders,
    });
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({
      status: "error",
      message: "Error setting password",
      error: error.message,
    });
  }
};

// MODIFIED: Profile Update handling new arrays and university
export const updateProfile = async (req, res) => {
  try {
    const allowedUpdates = [
      "fullName", "firstName", "lastName", "phoneNumber", 
      "country", "residentState", "address", "profilePicture",
    ];
    
    const updates = {};

    if (req.user.firstName) {
      // Taskers get these extra fields
      allowedUpdates.push("mainCategories", "subCategories", "university", "websiteLink");
    }

    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Helper to validate category arrays
    const validateCatArray = (arr) => {
        if (!Array.isArray(arr)) return null;
        return [...new Set(arr.filter((cat) => cat && typeof cat === "string" && cat.trim()))];
    };

    if (updates.mainCategories !== undefined) {
        const processed = validateCatArray(updates.mainCategories);
        if (!processed) return res.status(400).json({ status: "error", message: "mainCategories must be an array" });
        updates.mainCategories = processed;
    }

    if (updates.subCategories !== undefined) {
        const processed = validateCatArray(updates.subCategories);
        if (!processed) return res.status(400).json({ status: "error", message: "subCategories must be an array" });
        updates.subCategories = processed;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ status: "error", message: "No valid fields to update" });
    }

    if (updates.phoneNumber && updates.phoneNumber !== req.user.phoneNumber) {
      const Model = req.user.firstName ? Tasker : User;
      const existingUser = await Model.findOne({ phoneNumber: updates.phoneNumber });
      if (existingUser) {
        return res.status(400).json({ status: "error", message: "Phone number is already in use" });
      }
    }

    Object.assign(req.user, updates);
    await req.user.save();

    // --- ACTIVITY LOG: PROFILE UPDATE ---
    await logActivity(req, 'PROFILE_UPDATED', { 
        fieldsChanged: Object.keys(updates) 
    });

    // Just ONE response!
    res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      user: req.user,
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error updating profile", error: error.message });
  }
};
export const logout = async (req, res) => {
  try {
    res.status(200).json({ status: "success", message: "Logged out successfully" });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error logging out", error: error.message });
  }
};

export const updateProfilePicture = async (req, res) => {
  try {
    const { profilePicture } = req.body;
    if (!profilePicture) return res.status(400).json({ status: "error", message: "Profile picture URL is required" });
    
    try {
      new URL(profilePicture);
    } catch (error) {
      return res.status(400).json({ status: "error", message: "Invalid profile picture URL format" });
    }
    
    if (!req.user) {
      return res.status(401).json({ status: "error", message: "User not authenticated" });
    }

    req.user.profilePicture = profilePicture;
    await req.user.save();
    
    // --- ACTIVITY LOG: PICTURE UPDATED (Using the safe method!) ---
    await logActivity(req, 'PROFILE_PICTURE_UPDATED');

    res.status(200).json({ status: "success", message: "Profile picture updated successfully", profilePicture: req.user.profilePicture });
  } catch (error) {
    console.error('[updateProfilePicture ERROR]', error);
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error updating profile picture", error: error.message });
  }
};

export const uploadPreviousWork = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: "error", message: "At least one image is required" });
    }

    const uploaded = await uploadMultipleToCloudinary(req.files, 'taskhub/previous-work');

    // Append to existing previous work instead of replacing
    const tasker = req.tasker;
    const current = tasker.previousWork || [];
    const combined = [...current, ...uploaded];

    if (combined.length > 10) {
      return res.status(400).json({
        status: "error",
        message: `Maximum 10 previous work images allowed. You have ${current.length}, tried to add ${uploaded.length}`,
      });
    }

    tasker.previousWork = combined;
    await tasker.save();

    res.status(200).json({
      status: "success",
      message: "Previous work uploaded successfully",
      previousWork: tasker.previousWork,
    });
  } catch (error) {
    console.error("Upload previous work error:", error);
    const isTransient =
      error.name === 'TimeoutError' ||
      [499, 500, 502, 503, 504].includes(error.http_code);
    const status = isTransient ? 502 : 500;
    const message = isTransient
      ? "Upload service temporarily unavailable — please try again"
      : "Failed to upload previous work";
    res.status(status).json({ status: "error", message, error: error.message });
  }
};

export const deletePreviousWork = async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({ status: "error", message: "publicId is required" });
    }

    const tasker = req.tasker;
    const index = (tasker.previousWork || []).findIndex(img => img.publicId === publicId);
    if (index === -1) {
      return res.status(404).json({ status: "error", message: "Image not found in previous work" });
    }

    tasker.previousWork.splice(index, 1);
    await tasker.save();

    res.status(200).json({
      status: "success",
      message: "Previous work image removed",
      previousWork: tasker.previousWork,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error removing image", error: error.message });
  }
};

// MODIFIED: Specialized Endpoint for Onboarding the Category/University Flow
export const updateTaskerCategories = async (req, res) => {
  const { mainCategories, subCategories, university } = req.body;

  if (!req.tasker.firstName) {
    return res.status(403).json({
      status: "error",
      message: "This endpoint is only available for taskers",
    });
  }

  if (!mainCategories || !subCategories) {
    return res.status(400).json({
      status: "error",
      message: "Both mainCategories and subCategories arrays are required",
    });
  }

  if (!Array.isArray(mainCategories) || !Array.isArray(subCategories)) {
    return res.status(400).json({
      status: "error",
      message: "mainCategories and subCategories must be formatted as arrays",
    });
  }

  try {
    // Combine and validate all ObjectIds
    const allProvidedIds = [...mainCategories, ...subCategories];
    const validIds = allProvidedIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id));

    if (validIds.length !== allProvidedIds.length) {
      return res.status(400).json({
        status: "error",
        message: "All categories must be valid ObjectId strings",
      });
    }

    const uniqueIds = [...new Set(validIds)];

    // Verify all categories exist in the database
    if (uniqueIds.length > 0) {
        const existingCategories = await Category.find({
            _id: { $in: uniqueIds },
            isActive: true,
        });

        if (existingCategories.length !== uniqueIds.length) {
            return res.status(400).json({
                status: "error",
                message: "Some selected categories are invalid or have been deactivated",
            });
        }
    }

    // Apply updates
    req.tasker.mainCategories = [...new Set(mainCategories)];
    req.tasker.subCategories = [...new Set(subCategories)];
    
    // Save university if provided (e.g. for Campus Tasks)
    if (university !== undefined) {
        req.tasker.university = university;
    }

    await req.tasker.save();

    // Populate for the frontend response
    await req.tasker.populate("mainCategories", "name displayName description");
    await req.tasker.populate("subCategories", "name displayName description");

    res.status(200).json({
      status: "success",
      message: "Categories and University mapping updated successfully",
      data: {
          mainCategories: req.tasker.mainCategories,
          subCategories: req.tasker.subCategories,
          university: req.tasker.university
      }
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      status: "error",
      message: "Error updating categories",
      error: error.message,
    });
  }
};

// ... Location, DIDIT, and Notification ID handlers remain exactly the same ...
 // Make sure this exact top line is present!
export const deactivateAccount = async (req, res) => {
  const { password, idToken } = req.body || {};

  try {
    const hasLocalPassword = Boolean(req.user.password);

    // For Google-only accounts (no local password), require a fresh Google
    // ID token whose identity matches the linked googleId on the account.
    if (!hasLocalPassword) {
      if (!idToken) {
        return res.status(400).json({
          status: "error",
          code: "google_reauth_required",
          message: "Please re-authenticate with Google to deactivate this account.",
        });
      }

      let profile;
      try {
        profile = await verifyGoogleToken(idToken);
      } catch (err) {
        await logActivity(req, 'ACCOUNT_DEACTIVATION_FAILED', { reason: 'invalid_google_token' }, 'failed');
        return res.status(401).json({
          status: "error",
          code: err.code || "invalid_token",
          message: err.message || "Invalid Google token",
        });
      }

      if (!req.user.googleId || profile.googleId !== req.user.googleId) {
        await logActivity(req, 'ACCOUNT_DEACTIVATION_FAILED', { reason: 'google_identity_mismatch' }, 'failed');
        return res.status(401).json({
          status: "error",
          code: "google_identity_mismatch",
          message: "Google identity does not match this account.",
        });
      }
    } else {
      if (!password) {
        return res.status(400).json({ status: "error", message: "Password is required to deactivate account" });
      }
      const isValidPassword = await bcrypt.compare(password, req.user.password);
      if (!isValidPassword) {
        await logActivity(req, 'ACCOUNT_DEACTIVATION_FAILED', { reason: 'incorrect_password' }, 'failed');
        return res.status(400).json({ status: "error", message: "Incorrect password" });
      }
    }

    req.user.isActive = false;
    await req.user.save();

    await logActivity(req, 'ACCOUNT_DEACTIVATED', { via: hasLocalPassword ? 'password' : 'google' });

    res.status(200).json({ status: "success", message: "Account deactivated successfully" });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error deactivating account", error: error.message });
  }
}; // Make sure it ends cleanly with this bracket!
 


export const updateTaskerLocation = async (req, res) => {
  const { latitude, longitude } = req.body;
  if (!req.tasker) return res.status(403).json({ status: "error", message: "This endpoint is only available for taskers" });
  if (latitude === undefined || longitude === undefined) return res.status(400).json({ status: "error", message: "Both latitude and longitude are required" });
  if (typeof latitude !== "number" || typeof longitude !== "number") return res.status(400).json({ status: "error", message: "Latitude and longitude must be numbers" });
  if (latitude < -90 || latitude > 90) return res.status(400).json({ status: "error", message: "Latitude must be between -90 and 90 degrees" });
  if (longitude < -180 || longitude > 180) return res.status(400).json({ status: "error", message: "Longitude must be between -180 and 180 degrees" });
  try {
    req.tasker.location = { latitude, longitude, lastUpdated: new Date() };
    await req.tasker.save();
    res.status(200).json({
      status: "success",
      message: "Location updated successfully",
      location: req.tasker.location,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ status: "error", message: "Error updating location", error: error.message });
  }
};

export const verifyTaskerIdentity = async (req, res) => {
  return res.status(410).json({
    status: "error",
    message: "NIN verification via this endpoint has been deprecated. Please use the Didit identity verification flow instead.",
  });
};

export const getTaskerVerificationStatus = async (req, res) => {
  try {
    const taskerId = req.tasker.id;
    const tasker = await Tasker.findById(taskerId).select("verifyIdentity firstName lastName");
    if (!tasker) return res.status(404).json({ status: "error", message: "Tasker not found" });
    return res.status(200).json({
      status: "success",
      data: { taskerId: tasker._id, firstName: tasker.firstName, lastName: tasker.lastName, isVerified: tasker.verifyIdentity },
    });
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

export const updateUserNotificationId = async (req, res) => {
  try {
    const { notificationId } = req.body;
    const userId = req.user.id;
    if (!notificationId || typeof notificationId !== "string") return res.status(400).json({ status: "error", message: "Valid notification ID is required" });
    const user = await User.findByIdAndUpdate(userId, { notificationId: notificationId.trim(), updatedAt: new Date() }, { new: true }).select("_id fullName notificationId");
    if (!user) return res.status(404).json({ status: "error", message: "User not found" });
    return res.status(200).json({ status: "success", message: "Notification ID updated successfully", data: { userId: user._id, fullName: user.fullName, notificationId: user.notificationId }});
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

export const updateTaskerNotificationId = async (req, res) => {
  try {
    const { notificationId } = req.body;
    const taskerId = req.tasker.id;
    if (!notificationId || typeof notificationId !== "string") return res.status(400).json({ status: "error", message: "Valid notification ID is required" });
    const tasker = await Tasker.findByIdAndUpdate(taskerId, { notificationId: notificationId.trim(), updatedAt: new Date() }, { new: true }).select("_id firstName lastName notificationId");
    if (!tasker) return res.status(404).json({ status: "error", message: "Tasker not found" });
    Sentry.captureException(error);
    return res.status(200).json({ status: "success", message: "Notification ID updated successfully", data: { taskerId: tasker._id, firstName: tasker.firstName, lastName: tasker.lastName, notificationId: tasker.notificationId }});
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

export const removeUserNotificationId = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByIdAndUpdate(userId, { notificationId: null, updatedAt: new Date() }, { new: true }).select("_id fullName notificationId");
    if (!user) return res.status(404).json({ status: "error", message: "User not found" });
    return res.status(200).json({ status: "success", message: "Notification ID removed successfully", data: { userId: user._id, fullName: user.fullName, notificationId: user.notificationId }});
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

export const removeTaskerNotificationId = async (req, res) => {
  try {
    const taskerId = req.tasker.id;
    const tasker = await Tasker.findByIdAndUpdate(taskerId, { notificationId: null, updatedAt: new Date() }, { new: true }).select("_id firstName lastName notificationId");
    if (!tasker) return res.status(404).json({ status: "error", message: "Tasker not found" });
    return res.status(200).json({ status: "success", message: "Notification ID removed successfully", data: { taskerId: tasker._id, firstName: tasker.firstName, lastName: tasker.lastName, notificationId: tasker.notificationId }});
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

export const getMe = async (req, res) => {
  const user = await User.findById(req.user._id).select("fullName email isKYCVerified");
  const kyc = await KYCVerification.findOne({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ status: "success", data: { user, kycStatus: kyc ? kyc.status : "none" } });
};

// ==========================================
// GOOGLE AUTH: Shared identity/conflict helpers (Phase 3)
// ==========================================

// Returns the Mongoose models for the selected and opposite roles.
const resolveRoleModels = (user_type) => ({
  SelectedModel: user_type === "user" ? User : Tasker,
  OtherModel: user_type === "user" ? Tasker : User,
});

// Checks whether the given googleId is already linked to an account in the
// opposite role. Returns an error descriptor if so, otherwise null.
const findCrossRoleGoogleConflict = async (OtherModel, googleId) => {
  const match = await OtherModel.findOne({ googleId });
  if (!match) return null;
  return {
    http: 409,
    code: "account_conflict",
    message: "This Google account is already linked to a different account type.",
  };
};

// Checks whether the given email is already registered in the opposite role.
// Returns an error descriptor if so, otherwise null.
const findCrossRoleEmailConflict = async (OtherModel, email) => {
  const match = await OtherModel.findOne({ emailAddress: email });
  if (!match) return null;
  return {
    http: 409,
    code: "role_conflict",
    message: "This email is registered with a different account type.",
  };
};

// Maps a verifyGoogleToken error onto an HTTP response descriptor.
const mapGoogleVerifyError = (err) => ({
  http: err.code === "provider_not_configured" ? 500 : 401,
  code: err.code || "invalid_token",
  message: err.message || "Invalid Google token",
});

// Sends a conflict/error descriptor as a JSON response.
const sendAuthError = (res, descriptor) =>
  res.status(descriptor.http).json({
    status: "error",
    code: descriptor.code,
    message: descriptor.message,
  });

// ==========================================
// GOOGLE AUTH (Phase 1: Linked sign-in for existing accounts)
// ==========================================
// Verifies a Google ID token and signs in an existing TaskHub account in the
// selected role. If the account exists with a matching email but has not yet
// been linked to Google, it is linked and signed in. If no account exists in
// the selected role, a 404-like response is returned so the client can start
// the Google sign-up completion flow (Phase 2).
export const googleAuth = async (req, res) => {
  const { idToken, user_type } = req.body || {};

  if (!idToken) {
    return res.status(400).json({
      status: "error",
      code: "invalid_request",
      message: "idToken is required",
    });
  }

  if (user_type !== "user" && user_type !== "tasker") {
    return res.status(400).json({
      status: "error",
      code: "unsupported_role",
      message: "user_type must be either 'user' or 'tasker'",
    });
  }

  // 1. Verify Google token
  let profile;
  try {
    profile = await verifyGoogleToken(idToken);
  } catch (err) {
    return sendAuthError(res, mapGoogleVerifyError(err));
  }

  const { SelectedModel, OtherModel } = resolveRoleModels(user_type);

  try {
    // 2. Try to find an already-linked account by googleId in the selected role
    let account = await SelectedModel.findOne({ googleId: profile.googleId });
    let linkedNow = false;

    // 3. Cross-role Google identity guard
    if (!account) {
      const conflict = await findCrossRoleGoogleConflict(OtherModel, profile.googleId);
      if (conflict) return sendAuthError(res, conflict);
    }

    // 4. If no linked account yet, try to link an existing local account by email
    if (!account) {
      // Cross-role email guard: if the email is already registered in the
      // opposite role, reject explicitly so the client can recover instead of
      // being pushed into the sign-up completion path.
      const emailCrossRole = await findCrossRoleEmailConflict(OtherModel, profile.email);
      if (emailCrossRole) return sendAuthError(res, emailCrossRole);

      account = await SelectedModel.findOne({ emailAddress: profile.email });

      if (account) {
        // Cross-role email guard: if the email is also used in the other role,
        // we still allow linking the one in the selected role, but we do not
        // silently connect across roles.
        account.googleId = profile.googleId;
        const providers = Array.isArray(account.authProviders)
          ? account.authProviders
          : [];
        if (!providers.includes("google")) providers.push("google");
        if (account.password && !providers.includes("local")) providers.push("local");
        account.authProviders = providers;
        // Google has already verified the email
        account.isEmailVerified = true;
        await account.save();
        linkedNow = true;
      }
    }

    // 5. Phase 1 does not create new accounts. Signal the client to start
    //    the Google sign-up completion flow.
    if (!account) {
      return res.status(404).json({
        status: "error",
        code: "account_not_found",
        message:
          "No existing account for this Google identity. Sign-up completion required.",
        googleProfile: {
          email: profile.email,
          name: profile.name,
          givenName: profile.givenName,
          familyName: profile.familyName,
          picture: profile.picture,
        },
      });
    }

    // 6. Standard account state checks (parity with existing login)
    if (!account.isActive) {
      req.user = { _id: account._id };
      req.userType = user_type;
      await logActivity(
        req,
        "GOOGLE_AUTH_FAILED",
        { reason: "account_deactivated" },
        "failed"
      );
      return res.status(401).json({
        status: "error",
        code: "account_deactivated",
        message: "Account has been deactivated. Please contact support.",
      });
    }

    if (account.isLocked) {
      req.user = { _id: account._id };
      req.userType = user_type;
      await logActivity(
        req,
        "GOOGLE_AUTH_FAILED",
        { reason: "account_locked" },
        "failed"
      );
      return res.status(401).json({
        status: "error",
        code: "account_locked",
        message: "Account is temporarily locked.",
      });
    }

    // 7. Reset any failed-login counters on successful Google auth
    if (account.loginAttempts && account.loginAttempts > 0) {
      await account.updateOne({ $unset: { loginAttempts: 1, lockUntil: 1 } });
    }
    account.lastLogin = new Date();
    await account.save();

    // 8. Issue standard JWT
    const token = generateToken(account._id);

    req.user = account;
    req.userType = user_type;
    if (linkedNow) {
      await logActivity(req, "GOOGLE_ACCOUNT_LINKED", { email: profile.email });
    }
    await logActivity(req, "GOOGLE_AUTH_SUCCESS", {
      email: profile.email,
      linkedNow,
    });

    return res.status(200).json({
      status: "success",
      token,
      user_type,
      isEmailVerified: account.isEmailVerified,
      expiresIn: "24h",
      linkedNow,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      code: "server_error",
      message: "Error processing Google authentication",
      error: error.message,
    });
  }
};

// ==========================================
// GOOGLE AUTH (Phase 2: Sign-up completion)
// ==========================================
// Creates a brand-new User or Tasker account after the client has collected
// the remaining role-specific registration fields. Requires a valid Google
// ID token. On success, the account is created with Google linked as an
// additional auth method and a standard JWT is issued.
export const googleCompleteSignup = async (req, res) => {
  const { idToken, user_type } = req.body || {};

  if (!idToken) {
    return res.status(400).json({
      status: "error",
      code: "invalid_request",
      message: "idToken is required",
    });
  }

  if (user_type !== "user" && user_type !== "tasker") {
    return res.status(400).json({
      status: "error",
      code: "unsupported_role",
      message: "user_type must be either 'user' or 'tasker'",
    });
  }

  // 1. Verify Google token
  let profile;
  try {
    profile = await verifyGoogleToken(idToken);
  } catch (err) {
    return sendAuthError(res, mapGoogleVerifyError(err));
  }

  const { SelectedModel, OtherModel } = resolveRoleModels(user_type);

  try {
    // 2. Idempotency + conflict checks. If an account already exists, direct
    //    the client back to the sign-in route instead of creating a duplicate.
    const alreadyLinked = await SelectedModel.findOne({ googleId: profile.googleId });
    if (alreadyLinked) {
      return sendAuthError(res, {
        http: 409,
        code: "account_exists",
        message: "An account already exists for this Google identity. Please sign in.",
      });
    }

    const googleCrossRole = await findCrossRoleGoogleConflict(OtherModel, profile.googleId);
    if (googleCrossRole) return sendAuthError(res, googleCrossRole);

    const emailCrossRole = await findCrossRoleEmailConflict(OtherModel, profile.email);
    if (emailCrossRole) return sendAuthError(res, emailCrossRole);

    const emailTaken = await SelectedModel.findOne({ emailAddress: profile.email });
    if (emailTaken) {
      return sendAuthError(res, {
        http: 409,
        code: "email_in_use",
        message: "An account with this email already exists. Please sign in with Google to link it.",
      });
    }

    // 3. Collect & validate role-specific required fields
    const body = req.body || {};
    const sharedRequired = {
      phoneNumber: body.phoneNumber,
      country: body.country,
      residentState: body.residentState,
      address: body.address,
      dateOfBirth: body.dateOfBirth,
    };

    let roleFields;
    let requiredFields;
    if (user_type === "user") {
      const fullName = body.fullName || profile.name;
      roleFields = { fullName };
      requiredFields = { fullName, ...sharedRequired };
    } else {
      const firstName = body.firstName || profile.givenName;
      const lastName = body.lastName || profile.familyName;
      const originState = body.originState;
      roleFields = { firstName, lastName, originState };
      requiredFields = { firstName, lastName, originState, ...sharedRequired };
    }

    const missingFields = Object.entries(requiredFields)
      .filter(([, v]) => v === undefined || v === null || v === "")
      .map(([k]) => k);

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: "error",
        code: "missing_fields",
        message: "Missing required fields",
        missingFields,
      });
    }

    // 4. Age gate (parity with local register)
    if (calculateAge(requiredFields.dateOfBirth) < 16) {
      return res.status(400).json({
        status: "error",
        code: "age_restricted",
        message: "You must be at least 16 years old to register on TaskHub.",
      });
    }

    // 5. Phone uniqueness in the selected role (parity with local register)
    const phoneTaken = await SelectedModel.findOne({ phoneNumber: requiredFields.phoneNumber });
    if (phoneTaken) {
      return res.status(409).json({
        status: "error",
        code: "phone_in_use",
        message: "Phone number is already in use",
      });
    }

    // 6. Build the new account
    const base = {
      emailAddress: profile.email,
      phoneNumber: requiredFields.phoneNumber,
      country: requiredFields.country,
      residentState: requiredFields.residentState,
      address: requiredFields.address,
      dateOfBirth: requiredFields.dateOfBirth,
      profilePicture: profile.picture || "",
      wallet: 0,
      isEmailVerified: true,
      googleId: profile.googleId,
      authProviders: ["google"],
    };

    let account;
    if (user_type === "user") {
      account = new User({ ...base, fullName: roleFields.fullName });
    } else {
      account = new Tasker({
        ...base,
        firstName: roleFields.firstName,
        lastName: roleFields.lastName,
        originState: roleFields.originState,
      });
    }

    await account.save();

    // 7. Issue JWT + log
    const token = generateToken(account._id);

    req.user = account;
    req.userType = user_type;
    await logActivity(req, "REGISTER_SUCCESS", {
      email: profile.email,
      via: "google",
    });
    await logActivity(req, "GOOGLE_AUTH_SUCCESS", {
      email: profile.email,
      created: true,
    });

    return res.status(201).json({
      status: "success",
      token,
      user_type,
      isEmailVerified: true,
      expiresIn: "24h",
      created: true,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      code: "server_error",
      message: "Error completing Google sign-up",
      error: error.message,
    });
  }
};