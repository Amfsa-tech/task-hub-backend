import User from "../models/user.js";
import Tasker from "../models/tasker.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";
import Category from "../models/category.js";
import University from "../models/university.js";
import KYCVerification from "../models/kycVerification.js";
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

//User registration
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
      return res.status(400).json({
        status: "error",
        message: loginResult.message,
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      status: "success",
      token,
      user_type: "user",
      isEmailVerified: user.isEmailVerified,
      expiresIn: "never",
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
    const tasker = await Tasker.findOne({ emailAddress });
    if (!tasker) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid credentials" });
    }

    if (!tasker.isActive) {
      return res.status(400).json({
        status: "error",
        message: "Account has been deactivated. Please contact support.",
      });
    }

    const isValid = await bcrypt.compare(password, tasker.password);
    const loginResult = await handleLoginAttempt(tasker, isValid);

    if (!loginResult.success) {
      return res.status(400).json({
        status: "error",
        message: loginResult.message,
      });
    }

    const token = generateToken(tasker._id);

    return res.status(200).json({
      status: "success",
      token,
      user_type: "tasker",
      isEmailVerified: tasker.isEmailVerified,
      expiresIn: "never",
    });
  } catch (error) {
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
    res.status(500).json({ status: "error", message: "Error processing password reset request", error: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { code, newPassword, type, emailAddress } = req.body;
  if (!code || !newPassword || !type || !emailAddress) return res.status(400).json({ status: "error", message: "Missing required fields" });
  if (newPassword.length < 6) return res.status(400).json({ status: "error", message: "Password must be at least 6 characters long" });
  try {
    const Model = type === "user" ? User : Tasker;
    const user = await Model.findOne({ emailAddress, passwordResetToken: hashToken(code), passwordResetExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ status: "error", message: "Invalid or expired reset code, or email address does not match" });
    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    res.status(200).json({ status: "success", message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error resetting password", error: error.message });
  }
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ status: "error", message: "Current and new password are required" });
  if (newPassword.length < 6) return res.status(400).json({ status: "error", message: "New password must be at least 6 characters long" });
  try {
    const isValidPassword = await bcrypt.compare(currentPassword, req.user.password);
    if (!isValidPassword) return res.status(400).json({ status: "error", message: "Current password is incorrect" });
    req.user.password = await bcrypt.hash(newPassword, 10);
    await req.user.save();
    res.status(200).json({ status: "success", message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error changing password", error: error.message });
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
      allowedUpdates.push("mainCategories", "subCategories", "university");
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

    res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      user: req.user,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating profile", error: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    res.status(200).json({ status: "success", message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error logging out", error: error.message });
  }
};

export const updateProfilePicture = async (req, res) => {
  const { profilePicture } = req.body;
  if (!profilePicture) return res.status(400).json({ status: "error", message: "Profile picture URL is required" });
  try {
    new URL(profilePicture);
  } catch (error) {
    return res.status(400).json({ status: "error", message: "Invalid profile picture URL format" });
  }
  try {
    req.user.profilePicture = profilePicture;
    await req.user.save();
    res.status(200).json({ status: "success", message: "Profile picture updated successfully", profilePicture: req.user.profilePicture });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating profile picture", error: error.message });
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
    res.status(500).json({
      status: "error",
      message: "Error updating categories",
      error: error.message,
    });
  }
};

// ... Location, DIDIT, and Notification ID handlers remain exactly the same ...
export const deactivateAccount = async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ status: "error", message: "Password is required to deactivate account" });
  try {
    const isValidPassword = await bcrypt.compare(password, req.user.password);
    if (!isValidPassword) return res.status(400).json({ status: "error", message: "Incorrect password" });
    req.user.isActive = false;
    await req.user.save();
    res.status(200).json({ status: "success", message: "Account deactivated successfully" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error deactivating account", error: error.message });
  }
};

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
    return res.status(200).json({ status: "success", message: "Notification ID updated successfully", data: { taskerId: tasker._id, firstName: tasker.firstName, lastName: tasker.lastName, notificationId: tasker.notificationId }});
  } catch (error) {
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
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

export const getMe = async (req, res) => {
  const user = await User.findById(req.user._id).select("fullName email isKYCVerified");
  const kyc = await KYCVerification.findOne({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ status: "success", data: { user, kycStatus: kyc ? kyc.status : "none" } });
};