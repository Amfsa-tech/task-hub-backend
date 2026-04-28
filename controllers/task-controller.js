import Task from '../models/task.js';
import { Types } from 'mongoose';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { calculateDistance, milesToMeters } from '../utils/locationUtils.js';
import Category from '../models/category.js';
import University from '../models/university.js';
import Tasker from '../models/tasker.js';
import Bid from '../models/bid.js';
import Transaction from '../models/transaction.js';
import { notifyMatchingTaskers, notifyUserAboutTaskCompletion, notifyTaskerAboutTaskCancellation } from '../utils/notificationUtils.js';
import User from '../models/user.js';
import { uploadMultipleToCloudinary } from '../utils/uploadService.js';

/**
 * Parse a multipart form field that may be a JSON string.
 * Returns the parsed value or the original string.
 */
const parseField = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
};

// Helper function to check if ID is valid
const isValidObjectId = (id) => {
    return Types.ObjectId.isValid(id);
};

// Create a new task
const createTask = async (req, res) => {
    try {
        // With multer multipart parsing, complex fields arrive as JSON strings
        const title = req.body.title;
        const description = req.body.description;
        const categories = parseField(req.body.categories);
        const tags = parseField(req.body.tags);
        const location = parseField(req.body.location);
        const budget = parseField(req.body.budget);
        const isBiddingEnabled = parseField(req.body.isBiddingEnabled);
        const deadline = req.body.deadline;
        const mainCategory = req.body.mainCategory;
        const university = req.body.university;
        
        // Required fields validation
        const requiredFields = {
            title, description, categories, mainCategory,
            'location.latitude': location?.latitude,
            'location.longitude': location?.longitude,
            budget
        };
        
        const missingFields = [];
        for (const [field, value] of Object.entries(requiredFields)) {
            if (value === undefined || value === null) {
                missingFields.push(field);
            }
        }
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                status: "error",
                message: "Missing required fields",
                missingFields: missingFields
            });
        }

        // Validate categories array
        if (!categories || !Array.isArray(categories) || categories.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "At least one category is required",
                details: "Categories must be a non-empty array of category IDs"
            });
        }

        // Validate all category ObjectIds
        for (let i = 0; i < categories.length; i++) {
            if (!isValidObjectId(categories[i])) {
                return res.status(400).json({
                    status: "error",
                    message: `Invalid category ID format at index ${i}`,
                    details: "All category IDs must be valid ObjectId strings"
                });
            }
        }

        // Remove duplicates
        const uniqueCategories = [...new Set(categories)];

        // Verify all categories exist and are active
        const existingCategories = await Category.find({
            _id: { $in: uniqueCategories },
            isActive: true
        });

        if (existingCategories.length !== uniqueCategories.length) {
            const existingIds = existingCategories.map(cat => cat._id.toString());
            const invalidIds = uniqueCategories.filter(id => !existingIds.includes(id));
            
            return res.status(400).json({
                status: "error",
                message: "Some categories not found or inactive",
                details: `Invalid category IDs: ${invalidIds.join(', ')}`
            });
        }

        // Validate mainCategory exists and is active
        if (!isValidObjectId(mainCategory)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid mainCategory ID format"
            });
        }

        const mainCat = await Category.findOne({ _id: mainCategory, parentCategory: null });
        if (!mainCat || !mainCat.isActive) {
            return res.status(400).json({
                status: "error",
                message: "Main category not found or inactive"
            });
        }

        // Validate all subcategories belong to the provided mainCategory
        const mismatchedCategories = existingCategories.filter(
            cat => cat.parentCategory && cat.parentCategory.toString() !== mainCategory
        );
        if (mismatchedCategories.length > 0) {
            return res.status(400).json({
                status: "error",
                message: "All subcategories must belong to the selected main category",
                details: `Mismatched category IDs: ${mismatchedCategories.map(c => c._id).join(', ')}`
            });
        }

        // Validate university for campus-type main categories
        let validatedUniversity = null;
        const campusKeywords = ['campus'];
        const isCampusCategory = campusKeywords.some(kw => mainCat.name.includes(kw));

        if (isCampusCategory) {
            if (!university) {
                return res.status(400).json({
                    status: "error",
                    message: "University is required for campus tasks"
                });
            }
            if (!isValidObjectId(university)) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid university ID format"
                });
            }
            const uni = await University.findById(university);
            if (!uni || !uni.isActive) {
                return res.status(400).json({
                    status: "error",
                    message: "University not found or inactive"
                });
            }
            validatedUniversity = uni._id;
        } else if (university) {
            // Non-campus task with university provided — validate but allow
            if (isValidObjectId(university)) {
                const uni = await University.findById(university);
                if (uni && uni.isActive) {
                    validatedUniversity = uni._id;
                }
            }
        }

        // Upload images to Cloudinary if files were attached
        let uploadedImages = [];
        if (req.files && req.files.length > 0) {
            try {
                uploadedImages = await uploadMultipleToCloudinary(req.files, 'taskhub/tasks');
            } catch (uploadError) {
                console.error('Cloudinary upload error:', uploadError);
                return res.status(500).json({
                    status: "error",
                    message: "Failed to upload images",
                });
            }
        }
        
        // Validate budget
        if (isNaN(budget) || budget <= 0) {
            return res.status(400).json({
                status: "error",
                message: "Invalid budget value",
                details: "Budget must be a positive number"
            });
        }
        
        // Validate location coordinates
        if (isNaN(location.latitude) || isNaN(location.longitude)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid location coordinates",
                details: "Latitude and longitude must be valid numbers"
            });
        }
        
        // Validate deadline if provided
        if (deadline) {
            const deadlineDate = new Date(deadline);
            if (isNaN(deadlineDate.getTime()) || deadlineDate < new Date()) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid deadline",
                    details: "Deadline must be a valid future date"
                });
            }
        }
        
        const task = new Task({
            title,
            description,
            mainCategory: mainCat._id,
            subCategory: uniqueCategories[0],
            university: validatedUniversity,
            tags: tags || [],
            images: uploadedImages,
            location: {
                latitude: location.latitude,
                longitude: location.longitude,

            },
            budget,
            isBiddingEnabled: isBiddingEnabled || false,
            deadline: deadline || null,
            user: req.user._id
        });
        
        await task.save();
        
        // Notify matching taskers about the new task (non-blocking)
        try {
            console.log(`[notify] Triggering notifications for task ${task._id} (${task.title}) mainCategory: ${task.mainCategory}, subCategory: ${task.subCategory}`);
            await notifyMatchingTaskers(task);
        } catch (notificationError) {
            console.error('Error sending notifications:', notificationError);
            // Don't fail the task creation if notifications fail
        }
        
        res.status(201).json({
            status: "success",
            message: "Task created successfully",
            task
        });
    } catch (error) {
        console.error("Create task error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error creating task",
            error: error.message
        });
    }
};

// Get all tasks with pagination
const getAllTasks = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Filter options
        const filterOptions = {};
        
        // Filter by status if provided
        if (req.query.status && ['open', 'assigned', 'in-progress', 'completed', 'cancelled'].includes(req.query.status)) {
            filterOptions.status = req.query.status;
        }
        
        // Filter by categories if provided
        if (req.query.categories) {
            const categoryIds = Array.isArray(req.query.categories) 
                ? req.query.categories 
                : [req.query.categories];
            filterOptions.categories = { $in: categoryIds };
        }
        
        // Filter by bidding enabled
        if (req.query.isBiddingEnabled) {
            filterOptions.isBiddingEnabled = req.query.isBiddingEnabled === 'true';
        }
        
        // Count total tasks matching the filter
    const totalTasks = await Task.countDocuments(filterOptions);
        
        // Get tasks with pagination
    const tasks = await Task.find(filterOptions)
            .populate('user', 'fullName profilePicture')
            .populate('assignedTasker', 'firstName lastName profilePicture')
            .populate('mainCategory', 'name displayName description')
            .populate('subCategory', 'name displayName description')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        res.status(200).json({
            status: "success",
            count: tasks.length,
            totalPages: Math.ceil(totalTasks / limit),
            currentPage: page,
            tasks
        });
    } catch (error) {
        console.error("Get all tasks error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error fetching tasks",
            error: error.message
        });
    }
};

// Get a specific task by ID
const getTaskById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate Object ID
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid task ID format"
            });
        }
        
    const task = await Task.findById(id)
            .populate('user', 'fullName profilePicture')
            .populate('assignedTasker', 'firstName lastName profilePicture')
            .populate('mainCategory', 'name displayName description')
            .populate('subCategory', 'name displayName description');
            
        if (!task) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }
        
        res.status(200).json({
            status: "success",
            task
        });
    } catch (error) {
        console.error("Get task by ID error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error fetching task",
            error: error.message
        });
    }
};

// Update a task
const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate Object ID
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid task ID format"
            });
        }
        
    const task = await Task.findById(id);
        
        if (!task) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }
        
        // Check if the user is the owner of the task
        if (task.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: "error",
                message: "You are not authorized to update this task"
            });
        }
        
        // Prevent updating certain fields if task is already assigned
        if (task.status !== 'open' && req.body.isBiddingEnabled !== undefined) {
            return res.status(400).json({
                status: "error",
                message: "Cannot modify bidding settings for a task that is not open"
            });
        }
        
        // Upload new images to Cloudinary if files were attached
        let uploadedImages;
        if (req.files && req.files.length > 0) {
            try {
                uploadedImages = await uploadMultipleToCloudinary(req.files, 'taskhub/tasks');
            } catch (uploadError) {
                console.error('Cloudinary upload error:', uploadError);
                return res.status(500).json({
                    status: "error",
                    message: "Failed to upload images",
                });
            }
        }
        
        // Validate category if being updated
        if (req.body.category) {
            if (!isValidObjectId(req.body.category)) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid category ID format"
                });
            }
            
            const categoryExists = await Category.findOne({ _id: req.body.category, isActive: true });
            
            if (!categoryExists) {
                return res.status(400).json({
                    status: "error",
                    message: "Category not found or inactive"
                });
            }
        }

        // Prepare update data — parse JSON strings from multipart form fields
        const updateData = { updatedAt: Date.now() };

        // Copy simple fields if provided
        const simpleFields = ['title', 'description', 'deadline', 'mainCategory', 'university'];
        for (const field of simpleFields) {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        }

        // Parse fields that may be JSON-encoded
        if (req.body.budget !== undefined) updateData.budget = parseField(req.body.budget);
        if (req.body.isBiddingEnabled !== undefined) updateData.isBiddingEnabled = parseField(req.body.isBiddingEnabled);
        if (req.body.tags !== undefined) updateData.tags = parseField(req.body.tags);
        if (req.body.categories !== undefined) updateData.categories = parseField(req.body.categories);

        // Set images only if new files were uploaded
        if (uploadedImages) {
            updateData.images = uploadedImages;
        }
        
        // Handle location update
        const locationInput = parseField(req.body.location);
        if (locationInput) {
            // Validate required location fields if updating location
            if (locationInput.latitude === undefined || locationInput.longitude === undefined) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid location data",
                    details: "Latitude and longitude are required when updating location"
                });
            }
            
            // Validate location coordinates
            if (isNaN(locationInput.latitude) || isNaN(locationInput.longitude)) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid location coordinates",
                    details: "Latitude and longitude must be valid numbers"
                });
            }
            
            updateData.location = {
                latitude: locationInput.latitude,
                longitude: locationInput.longitude,
                address: locationInput.address || task.location.address || "",
                state: locationInput.state || task.location.state || "",
                country: locationInput.country || task.location.country || ""
            };
        }
        
        // Prevent updating user or assignedTasker
        updateData.user = task.user;
        updateData.assignedTasker = task.assignedTasker;
        
        // Update the task
    const updatedTask = await Task.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        
        res.status(200).json({
            status: "success",
            message: "Task updated successfully",
            task: updatedTask
        });
    } catch (error) {
        console.error("Update task error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error updating task",
            error: error.message
        });
    }
};

// Delete a task
const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate Object ID
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid task ID format"
            });
        }
        
    const task = await Task.findById(id);
        
        if (!task) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }
        
        // Check if the user is the owner of the task
        if (task.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: "error",
                message: "You are not authorized to delete this task"
            });
        }
        
        // Prevent deletion if task is already in progress or completed
        if (['in-progress', 'completed'].includes(task.status)) {
            return res.status(400).json({
                status: "error",
                message: `Cannot delete a task that is ${task.status}`
            });
        }
        
    await Task.findByIdAndDelete(id);
        
        res.status(200).json({
            status: "success",
            message: "Task deleted successfully"
        });
    } catch (error) {
        console.error("Delete task error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error deleting task",
            error: error.message
        });
    }
};

// Get tasks created by current user with pagination
const getUserTasks = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Filter options
        const filterOptions = { user: req.user._id };
        
        // Filter by status if provided
        if (req.query.status && ['open', 'assigned', 'in-progress', 'completed', 'cancelled'].includes(req.query.status)) {
            filterOptions.status = req.query.status;
        }
        
        // Count total tasks matching the filter
    const totalTasks = await Task.countDocuments(filterOptions);
        
        // Get tasks with pagination
    const tasks = await Task.find(filterOptions)
            .populate('assignedTasker', 'firstName lastName profilePicture')
            .populate('mainCategory', 'name displayName description')
            .populate('subCategory', 'name displayName description')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        res.status(200).json({
            status: "success",
            count: tasks.length,
            totalPages: Math.ceil(totalTasks / limit),
            currentPage: page,
            tasks
        });
    } catch (error) {
        console.error("Get user tasks error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error fetching tasks",
            error: error.message
        });
    }
};

// Change task status
const changeTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid task ID format"
            });
        }
        
    const task = await Task.findById(id).populate('user');
        if (!task) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }
        
        // Check ownership or authorization
        const isUser = req.user && req.user._id.toString() === task.user._id.toString();
        const isTasker = req.tasker && task.assignedTasker && req.tasker._id.toString() === task.assignedTasker.toString();
        
        if (!isUser && !isTasker) {
            return res.status(403).json({
                status: "error",
                message: "Not authorized to change this task status"
            });
        }
        
        // Validate status transitions
        const validStatuses = ['open', 'assigned', 'in-progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid status",
                details: `Status must be one of: ${validStatuses.join(', ')}`
            });
        }
        
        // Business logic for status transitions
        const currentStatus = task.status;
        let allowedTransitions = [];
        
        if (isUser) {
            // Users can cancel only before work starts
            if (['open', 'assigned', 'in-progress'].includes(currentStatus)) {
                allowedTransitions = ['cancelled'];
                if (currentStatus === 'open') {
                    allowedTransitions.push('open'); // Allow status refresh
                }
            } else {
                allowedTransitions = [];
            }
        }
        
        if (isTasker) {
            // Taskers can update progress
            switch (currentStatus) {
                case 'assigned':
                    allowedTransitions = ['in-progress'];
                    break;
                case 'in-progress':
                    allowedTransitions = ['completed'];
                    break;
                default:
                    allowedTransitions = [];
            }
        }
        
        if (!allowedTransitions.includes(status)) {
            return res.status(400).json({
                status: "error",
                message: `Cannot change status from ${currentStatus} to ${status}`,
                details: `Allowed transitions: ${allowedTransitions.join(', ')}`
            });
        }
        
        // Special handling: assigned -> in-progress (generate completion code)
        if (isTasker && currentStatus === 'assigned' && status === 'in-progress') {
            // Generate a 6-digit completion code for the user to give the tasker
            const completionCode = crypto.randomInt(100000, 999999).toString();
            task.completionCode = completionCode;
            task.status = 'in-progress';
            task.updatedAt = new Date();
            await task.save();
            return res.json({
                status: 'success',
                message: 'Task started. A completion code has been sent to the task poster.',
                task: {
                    ...task.toObject(),
                    completionCode: undefined // Don't expose code to tasker
                }
            });
        }

        // Special handling: in-progress -> completed (require completion code, release escrow with platform fee)
        if (isTasker && currentStatus === 'in-progress' && status === 'completed') {
            const { completionCode } = req.body;

            if (!completionCode) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Completion code is required to complete a task'
                });
            }

            if (task.completionCode !== completionCode) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid completion code'
                });
            }

            try {
                if (task.isEscrowHeld && task.escrowAmount > 0 && task.assignedTasker) {
                    
                    // NEW MATH: Calculates fee so it is exactly 15% of the Tasker's final payout
                    const platformFeeRate = 0.15;
                    const taskerPayout = Math.round(task.escrowAmount / (1 + platformFeeRate));
                    const platformFee = task.escrowAmount - taskerPayout;

                    await Tasker.updateOne(
                        { _id: task.assignedTasker },
                        { $inc: { wallet: taskerPayout } }
                    );
                    
                    task.isEscrowHeld = false;
                    task.platformFee = platformFee;
                    task.taskerPayout = taskerPayout;
                    task.escrowStatus = 'released';
                    task.completedAt = new Date();

                    // ... (keep the rest of the transaction recording logic exactly the same)

                    // Record escrow_release transaction (tasker payout)
                    try {
                        await Transaction.create({
                            user: task.user._id,
                            tasker: task.assignedTasker,
                            amount: taskerPayout,
                            type: 'debit',
                            description: `Escrow released for task: ${task.title}`,
                            status: 'success',
                            reference: `ESC-REL-${task._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                            provider: 'system',
                            paymentPurpose: 'escrow_release',
                            currency: 'NGN',
                            metadata: { taskId: task._id.toString(), taskerPayout, platformFee }
                        });
                    } catch (txnErr) {
                        console.error('Failed to create escrow_release transaction:', txnErr);
                    }

                    // Record platform_fee transaction
                    try {
                        await Transaction.create({
                            user: task.user._id,
                            amount: platformFee,
                            type: 'debit',
                            description: `Platform fee (15%) for task: ${task.title}`,
                            status: 'success',
                            reference: `PLT-FEE-${task._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                            provider: 'system',
                            paymentPurpose: 'platform_fee',
                            currency: 'NGN',
                            metadata: { taskId: task._id.toString(), escrowAmount: task.escrowAmount, feeRate: platformFeeRate }
                        });
                    } catch (txnErr) {
                        console.error('Failed to create platform_fee transaction:', txnErr);
                    }
                }
                task.status = 'completed';
                task.updatedAt = new Date();
                task.completionCode = undefined; // Clear sensitive code
                await task.save();

                // Notify user about task completion
                try {
                    const tasker = await Tasker.findById(task.assignedTasker).select('firstName lastName');
                    if (tasker) {
                        notifyUserAboutTaskCompletion(task.user._id, task, tasker).catch((e) => {
                            console.error('notifyUserAboutTaskCompletion error:', e);
                        });
                    }
                } catch (notifyErr) {
                    console.error('Failed to send task completion notification:', notifyErr);
                }

                return res.json({
                    status: 'success',
                    message: 'Task completed and payout released',
                    task
                });
            } catch (err) {
                console.error('Payout release error:', err);
                return res.status(500).json({
                    status: 'error',
                    message: 'Could not complete task',
                    error: err.message
                });
            }
        }

        // Special handling: user cancels from 'assigned' -> refund escrow
        if (isUser && status === 'cancelled' && currentStatus === 'assigned') {
            try {
                if (task.isEscrowHeld && task.escrowAmount > 0) {
                    await User.updateOne(
                        { _id: task.user._id },
                        { $inc: { wallet: task.escrowAmount } }
                    );
                    task.isEscrowHeld = false;
                    task.escrowStatus = 'refunded';

                    // Record escrow_refund transaction
                    try {
                        await Transaction.create({
                            user: task.user._id,
                            amount: task.escrowAmount,
                            type: 'credit',
                            description: `Escrow refunded for cancelled task: ${task.title}`,
                            status: 'success',
                            reference: `ESC-REF-${task._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                            provider: 'system',
                            paymentPurpose: 'escrow_refund',
                            currency: 'NGN',
                            metadata: { taskId: task._id.toString() }
                        });
                    } catch (txnErr) {
                        console.error('Failed to create escrow_refund transaction:', txnErr);
                    }
                }
                task.status = 'cancelled';
                task.updatedAt = new Date();
                await task.save();

                // Notify the assigned tasker about cancellation
                if (task.assignedTasker) {
                    notifyTaskerAboutTaskCancellation(task.assignedTasker, task).catch((e) => {
                        console.error('notifyTaskerAboutTaskCancellation error:', e);
                    });
                }

                return res.json({
                    status: 'success',
                    message: 'Task cancelled and funds refunded',
                    task
                });
            } catch (err) {
                console.error('Refund on cancel error:', err);
                return res.status(500).json({
                    status: 'error',
                    message: 'Could not cancel task',
                    error: err.message
                });
            }
        }

        // Special handling: user cancels from 'in-progress' -> refund escrow
        if (isUser && status === 'cancelled' && currentStatus === 'in-progress') {
            try {
                if (task.isEscrowHeld && task.escrowAmount > 0) {
                    await User.updateOne(
                        { _id: task.user._id },
                        { $inc: { wallet: task.escrowAmount } }
                    );
                    task.isEscrowHeld = false;
                    task.escrowStatus = 'refunded';

                    // Record escrow_refund transaction
                    try {
                        await Transaction.create({
                            user: task.user._id,
                            amount: task.escrowAmount,
                            type: 'credit',
                            description: `Escrow refunded for cancelled in-progress task: ${task.title}`,
                            status: 'success',
                            reference: `ESC-REF-${task._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                            provider: 'system',
                            paymentPurpose: 'escrow_refund',
                            currency: 'NGN',
                            metadata: { taskId: task._id.toString(), cancelledFrom: 'in-progress' }
                        });
                    } catch (txnErr) {
                        console.error('Failed to create escrow_refund transaction:', txnErr);
                    }
                }
                task.status = 'cancelled';
                task.completionCode = undefined;
                task.updatedAt = new Date();
                await task.save();

                // Notify the assigned tasker about cancellation
                if (task.assignedTasker) {
                    notifyTaskerAboutTaskCancellation(task.assignedTasker, task).catch((e) => {
                        console.error('notifyTaskerAboutTaskCancellation error:', e);
                    });
                }

                return res.json({
                    status: 'success',
                    message: 'Task cancelled and funds refunded',
                    task
                });
            } catch (err) {
                console.error('Refund on in-progress cancel error:', err);
                return res.status(500).json({
                    status: 'error',
                    message: 'Could not cancel task',
                    error: err.message
                });
            }
        }

        // Special handling: user cancels from 'open'
        if (isUser && status === 'cancelled' && currentStatus === 'open') {
            task.status = 'cancelled';
            task.updatedAt = new Date();
            await task.save();
            return res.json({
                status: 'success',
                message: 'Task cancelled',
                task
            });
        }

        // Default path for other valid transitions (should be minimal with current rules)
        task.status = status;
        task.updatedAt = new Date();
        await task.save();
        return res.json({
            status: 'success',
            message: 'Task status updated successfully',
            task
        });
    } catch (error) {
        console.error("Change task status error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error updating task status",
            error: error.message
        });
    }
};

// Get tasker feed - tasks matching tasker's categories
const getTaskerFeed = async (req, res) => {
    try {
        // Get pagination parameters - supports both cursor-based and offset-based
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
        const cursor = req.query.cursor; // _id of the last task seen (for "load more")
        // Legacy offset-based pagination (kept for backward compatibility)
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;
        
        // Get tasker with categories
    const tasker = await Tasker.findById(req.tasker._id).populate('subCategories');
        
        if (!tasker) {
            return res.status(404).json({
                status: "error",
                message: "Tasker not found"
            });
        }
        
        if (!tasker.subCategories || tasker.subCategories.length === 0) {
            return res.json({
                status: "success",
                message: "No categories set. Please update your categories to see relevant tasks.",
                tasks: [],
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalTasks: 0,
                    hasNextPage: false,
                    hasPrevPage: false,
                    tasksPerPage: limit,
                    nextCursor: null
                }
            });
        }
        
        // Get tasker's category IDs
        const taskerCategoryIds = tasker.subCategories.map(cat => cat._id);
        
        // Build filter for tasks matching tasker's categories
        const filterOptions = {
            // Only show open tasks (available for bidding)
            status: 'open',
            // Optionally filter by bidding enabled
            ...(req.query.biddingOnly === 'true' && { isBiddingEnabled: true })
        };

        // Only filter by category if tasker has subCategories set
        if (taskerCategoryIds.length > 0) {
            filterOptions.subCategory = { $in: taskerCategoryIds };
        }
        
        // Additional filters from query params
        if (req.query.budget_min != null || req.query.budget_max != null) {
            filterOptions.budget = {};
            if (req.query.budget_min != null) {
                filterOptions.budget.$gte = parseFloat(req.query.budget_min);
            }
            if (req.query.budget_max != null) {
                filterOptions.budget.$lte = parseFloat(req.query.budget_max);
            }
        }
        
        // Location-based filtering (within specified radius)
        const hasLocation = tasker.location && tasker.location.latitude && tasker.location.longitude;
        const maxDistanceMiles = parseFloat(req.query.maxDistance) || 200; // Default 200 miles

        if (hasLocation) {
            // Use bounding box for initial MongoDB filtering (performance optimization)
            const latDelta = maxDistanceMiles / 69; // Rough miles to degrees latitude
            const lngDelta = maxDistanceMiles / (69 * Math.cos(tasker.location.latitude * Math.PI / 180));
            
            filterOptions['location.latitude'] = {
                $gte: tasker.location.latitude - latDelta,
                $lte: tasker.location.latitude + latDelta
            };
            filterOptions['location.longitude'] = {
                $gte: tasker.location.longitude - lngDelta,
                $lte: tasker.location.longitude + lngDelta
            };
        }

        // Cursor-based pagination: only fetch tasks older than the cursor
        if (cursor) {
            const { isValidObjectId } = await import('mongoose');
            if (isValidObjectId(cursor)) {
                filterOptions._id = { $lt: cursor };
            }
        }

        // Fetch tasks with an over-fetch buffer to account for distance filtering
        // We fetch more than `limit` because precise distance filtering may remove some results
        const fetchLimit = hasLocation ? limit * 5 : (cursor ? limit : 0);
        
        let taskQuery = Task.find(filterOptions)
            .populate('user', 'fullName profilePicture')
            .populate('mainCategory', 'name displayName description')
            .populate('subCategory', 'name displayName description')
            .select('-__v')
            .sort({ _id: -1 });
        
        // For cursor-based pagination, apply limit at DB level for performance
        // For offset-based, we need total count so fetch without limit
        if (cursor) {
            taskQuery = taskQuery.limit(fetchLimit || limit);
        } else if (hasLocation) {
            // Over-fetch to account for distance filtering, but don't load everything
            taskQuery = taskQuery.limit(skip + fetchLimit);
        }
        
        let tasks = await taskQuery;
        
        // Apply precise distance filtering if tasker has location
        if (hasLocation) {
            const maxDistanceMeters = milesToMeters(maxDistanceMiles);
            
            tasks = tasks.filter(task => {
                if (!task.location || !task.location.latitude || !task.location.longitude) {
                    return false;
                }
                
                const distance = calculateDistance(
                    tasker.location.latitude,
                    tasker.location.longitude,
                    task.location.latitude,
                    task.location.longitude
                );
                
                return distance <= maxDistanceMeters;
            });
        }

        // Apply pagination AFTER all filtering
        const totalTasks = tasks.length;
        let paginatedTasks;
        
        if (cursor) {
            // Cursor-based: just take the first `limit` items (already filtered by _id < cursor)
            paginatedTasks = tasks.slice(0, limit);
        } else {
            // Legacy offset-based pagination
            paginatedTasks = tasks.slice(skip, skip + limit);
        }
        
        const totalPages = Math.ceil(totalTasks / limit);
        const nextCursor = paginatedTasks.length > 0 ? paginatedTasks[paginatedTasks.length - 1]._id : null;
        const hasMore = paginatedTasks.length === limit;
        
        // Check if tasker has already bid on these tasks
        const taskIds = paginatedTasks.map(task => task._id);
        const existingBids = await Bid.find({
            task: { $in: taskIds },
            tasker: req.tasker._id
        }).select('task amount bidType status');
        
        // Create a map of taskId -> bid for quick lookup
        const bidMap = {};
        existingBids.forEach(bid => {
            bidMap[bid.task.toString()] = {
                amount: bid.amount,
                bidType: bid.bidType,
                status: bid.status,
                hasBid: true
            };
        });
        
        // Add bid information to tasks
        const tasksWithBidInfo = paginatedTasks.map(task => {
            const taskObj = task.toObject();
            const bidInfo = bidMap[task._id.toString()];
            
            // Add application type information
            const applicationInfo = {
                canApply: !bidInfo?.hasBid,
                applicationMode: task.isBiddingEnabled ? 'bidding' : 'fixed',
                applicationLabel: task.isBiddingEnabled ? 'Place Bid' : 'Apply for Task',
                priceEditable: task.isBiddingEnabled,
                fixedPrice: task.isBiddingEnabled ? null : task.budget
            };
            
            return {
                ...taskObj,
                taskerBidInfo: bidInfo || { hasBid: false },
                applicationInfo
            };
        });
        
        // Prevent stale cached responses for feed data
        res.set('Cache-Control', 'no-store');
        
        res.json({
            status: "success",
            message: "Tasker feed retrieved successfully",
            tasks: tasksWithBidInfo,
            pagination: {
                currentPage: page,
                totalPages,
                totalTasks,
                hasNextPage: cursor ? hasMore : page < totalPages,
                hasPrevPage: cursor ? !!cursor : page > 1,
                tasksPerPage: limit,
                nextCursor
            }
        });
        
    } catch (error) {
        console.error("Get tasker feed error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error retrieving tasker feed",
            error: error.message
        });
    }
};

// Get completion code for a task (task poster only)
const getCompletionCode = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid task ID format"
            });
        }

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }

        // Only the task poster can view the completion code
        if (task.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: "error",
                message: "Not authorized to view this completion code"
            });
        }

        if (task.status !== 'in-progress') {
            return res.status(400).json({
                status: "error",
                message: "Completion code is only available for in-progress tasks"
            });
        }

        if (!task.completionCode) {
            return res.status(404).json({
                status: "error",
                message: "No completion code generated for this task"
            });
        }

        return res.json({
            status: 'success',
            data: {
                taskId: task._id,
                completionCode: task.completionCode
            }
        });
    } catch (error) {
        console.error("Get completion code error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error fetching completion code",
            error: error.message
        });
    }
};

const getTaskerTasks = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filterOptions = { assignedTasker: req.tasker._id };

        if (req.query.status && ['assigned', 'in-progress', 'completed', 'cancelled'].includes(req.query.status)) {
            filterOptions.status = req.query.status;
        }

        const totalTasks = await Task.countDocuments(filterOptions);

        const tasks = await Task.find(filterOptions)
            .populate('user', 'firstName lastName profilePicture')
            .populate('mainCategory', 'name displayName description')
            .populate('subCategory', 'name displayName description')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            status: "success",
            count: tasks.length,
            totalPages: Math.ceil(totalTasks / limit),
            currentPage: page,
            tasks
        });
    } catch (error) {
        console.error("Get tasker tasks error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error fetching tasker tasks",
            error: error.message
        });
    }
};

export  {
    createTask,
    getAllTasks,
    getTaskById,
    updateTask,
    deleteTask,
    getUserTasks,
    changeTaskStatus,
    getTaskerFeed,
    getCompletionCode,
    getTaskerTasks
}; 