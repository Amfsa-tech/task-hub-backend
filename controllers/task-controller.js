import Task from '../models/task.js';
import { Types, startSession } from 'mongoose';
import { calculateDistance, milesToMeters } from '../utils/locationUtils.js';
import Category from '../models/category.js';
import Tasker from '../models/tasker.js';
import Bid from '../models/bid.js';
import { notifyMatchingTaskers } from '../utils/notificationUtils.js';
import User from '../models/user.js';

// Helper function to check if ID is valid
const isValidObjectId = (id) => {
    return Types.ObjectId.isValid(id);
};

// Create a new task
const createTask = async (req, res) => {
    try {
        const { title, description, categories, tags, images, location, budget, isBiddingEnabled, deadline } = req.body;
        
        // Required fields validation
        const requiredFields = {
            title, description, categories, 
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

        // Validate images array if provided
        if (images && Array.isArray(images)) {
            for (let i = 0; i < images.length; i++) {
                if (!images[i].url) {
                    return res.status(400).json({
                        status: "error",
                        message: "Invalid image format",
                        details: `Image at index ${i} is missing the URL`
                    });
                }
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
            categories: uniqueCategories,
            tags: tags || [],
            images: images || [],
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
            console.log(`[notify] Triggering notifications for task ${task._id} (${task.title}) in categories: ${task.categories.join(', ')}`);
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
            .populate('categories', 'name displayName description')
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
            .populate('categories', 'name displayName description');
            
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
        
        // Validate images array if provided
        if (req.body.images && Array.isArray(req.body.images)) {
            for (let i = 0; i < req.body.images.length; i++) {
                if (!req.body.images[i].url) {
                    return res.status(400).json({
                        status: "error",
                        message: "Invalid image format",
                        details: `Image at index ${i} is missing the URL`
                    });
                }
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

        // Prepare update data
        const updateData = { ...req.body, updatedAt: Date.now() };
        
        // Handle location update
        if (req.body.location) {
            // Validate required location fields if updating location
            if (req.body.location.latitude === undefined || req.body.location.longitude === undefined) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid location data",
                    details: "Latitude and longitude are required when updating location"
                });
            }
            
            // Validate location coordinates
            if (isNaN(req.body.location.latitude) || isNaN(req.body.location.longitude)) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid location coordinates",
                    details: "Latitude and longitude must be valid numbers"
                });
            }
            
            updateData.location = {
                latitude: req.body.location.latitude,
                longitude: req.body.location.longitude,
                address: req.body.location.address || task.location.address || "",
                state: req.body.location.state || task.location.state || "",
                country: req.body.location.country || task.location.country || ""
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
            .populate('categories', 'name displayName description')
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
            if (['open', 'assigned'].includes(currentStatus)) {
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
        
        // Special handling: assigned -> in-progress (escrow already held at acceptance)
        if (isTasker && currentStatus === 'assigned' && status === 'in-progress') {
            task.status = 'in-progress';
            task.updatedAt = new Date();
            await task.save();
            return res.json({
                status: 'success',
                message: 'Task started',
                task
            });
        }

        // Special handling: in-progress -> completed (release escrow to tasker)
        if (isTasker && currentStatus === 'in-progress' && status === 'completed') {
            const session = await startSession();
            session.startTransaction();
            try {
                if (task.isEscrowHeld && task.escrowAmount > 0) {
                    await Tasker.updateOne(
                        { _id: task.assignedTasker },
                        { $inc: { wallet: task.escrowAmount } },
                        { session }
                    );
                    task.isEscrowHeld = false;
                    task.escrowAmount = 0;
                }
                task.status = 'completed';
                task.updatedAt = new Date();
                await task.save({ session });
                await session.commitTransaction();
                session.endSession();
                return res.json({
                    status: 'success',
                    message: 'Task completed and payout released',
                    task
                });
            } catch (err) {
                await session.abortTransaction();
                session.endSession();
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
            const session = await startSession();
            session.startTransaction();
            try {
                if (task.isEscrowHeld && task.escrowAmount > 0) {
                    await User.updateOne(
                        { _id: task.user._id },
                        { $inc: { wallet: task.escrowAmount } },
                        { session }
                    );
                    task.isEscrowHeld = false;
                    task.escrowAmount = 0;
                }
                task.status = 'cancelled';
                task.updatedAt = new Date();
                await task.save({ session });
                await session.commitTransaction();
                session.endSession();
                return res.json({
                    status: 'success',
                    message: 'Task cancelled and funds refunded',
                    task
                });
            } catch (err) {
                await session.abortTransaction();
                session.endSession();
                console.error('Refund on cancel error:', err);
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
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Get tasker with categories
    const tasker = await Tasker.findById(req.tasker._id).populate('categories');
        
        if (!tasker) {
            return res.status(404).json({
                status: "error",
                message: "Tasker not found"
            });
        }
        
        if (!tasker.categories || tasker.categories.length === 0) {
            return res.json({
                status: "success",
                message: "No categories set. Please update your categories to see relevant tasks.",
                tasks: [],
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalTasks: 0,
                    hasNextPage: false,
                    hasPrevPage: false
                }
            });
        }
        
        // Get tasker's category IDs
        const taskerCategoryIds = tasker.categories.map(cat => cat._id);
        
        // Build filter for tasks matching tasker's categories
        const filterOptions = {
            // Only show tasks in tasker's categories
            categories: { $in: taskerCategoryIds },
            // Only show open tasks (available for bidding)
            status: 'open',
            // Optionally filter by bidding enabled
            ...(req.query.biddingOnly === 'true' && { isBiddingEnabled: true })
        };
        
        // Additional filters from query params
        if (req.query.budget_min || req.query.budget_max) {
            filterOptions.budget = {};
            if (req.query.budget_min) {
                filterOptions.budget.$gte = parseFloat(req.query.budget_min);
            }
            if (req.query.budget_max) {
                filterOptions.budget.$lte = parseFloat(req.query.budget_max);
            }
        }
        
        // Location-based filtering (within specified radius)
        // Apply location filtering if tasker has location set (default 200 miles)
        if (tasker.location && tasker.location.latitude && tasker.location.longitude) {
            const maxDistanceMiles = parseFloat(req.query.maxDistance) || 200; // Default 200 miles
            
            // Debugging: Log the tasker's location and max distance
            console.log('🌍 Location filtering enabled:');
            console.log(`   Tasker location: ${tasker.location.latitude}, ${tasker.location.longitude}`);
            console.log(`   Max distance: ${maxDistanceMiles} miles`);
            
            // Use bounding box for initial MongoDB filtering (performance optimization)
            const latDelta = maxDistanceMiles / 69; // Rough miles to degrees latitude
            const lngDelta = maxDistanceMiles / (69 * Math.cos(tasker.location.latitude * Math.PI / 180)); // Adjust for longitude
            
            filterOptions['location.latitude'] = {
                $gte: tasker.location.latitude - latDelta,
                $lte: tasker.location.latitude + latDelta
            };
            filterOptions['location.longitude'] = {
                $gte: tasker.location.longitude - lngDelta,
                $lte: tasker.location.longitude + lngDelta
            };
            
            console.log(`   Bounding box: lat ${tasker.location.latitude - latDelta} to ${tasker.location.latitude + latDelta}`);
            console.log(`   Bounding box: lng ${tasker.location.longitude - lngDelta} to ${tasker.location.longitude + lngDelta}`);
        }
        
        // Count total tasks matching the filter
    const totalTasks = await Task.countDocuments(filterOptions);
        const totalPages = Math.ceil(totalTasks / limit);
        
        // Get tasks with pagination
    let tasks = await Task.find(filterOptions)
            .populate('user', 'fullName profilePicture')
            .populate('categories', 'name displayName description')
            .select('-__v') // Exclude version field
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        // Apply precise distance filtering if tasker has location
        if (tasker.location && tasker.location.latitude && tasker.location.longitude) {
            const maxDistanceMiles = parseFloat(req.query.maxDistance) || 200; // Default 200 miles
            const maxDistanceMeters = milesToMeters(maxDistanceMiles);
            
            console.log(`🔍 Applying precise distance filtering...`);
            console.log(`   Tasks before filtering: ${tasks.length}`);
            
            tasks = tasks.filter(task => {
                // Check if task has location
                if (!task.location || !task.location.latitude || !task.location.longitude) {
                    console.log(`   ❌ Task "${task.title}" has no location, excluding`);
                    return false;
                }
                
                // Calculate precise distance
                const distance = calculateDistance(
                    tasker.location.latitude,
                    tasker.location.longitude,
                    task.location.latitude,
                    task.location.longitude
                );
                
                const distanceMiles = distance / 1609.34; // Convert meters to miles
                const withinRadius = distance <= maxDistanceMeters;
                
                console.log(`   📍 Task "${task.title}" at ${task.location.latitude}, ${task.location.longitude}`);
                console.log(`      Distance: ${distanceMiles.toFixed(2)} miles (${distance.toFixed(0)} meters)`);
                console.log(`      Within radius: ${withinRadius ? '✅ YES' : '❌ NO'}`);
                
                return withinRadius;
            });
            
            console.log(`   Tasks after filtering: ${tasks.length}`);
        }
        
        // Check if tasker has already bid on these tasks
        const taskIds = tasks.map(task => task._id);
    const existingBids = await Bid.find({
            task: { $in: taskIds },
            tasker: req.tasker._id
        }).select('task amount bidType');
        
        // Create a map of taskId -> bid for quick lookup
        const bidMap = {};
        existingBids.forEach(bid => {
            bidMap[bid.task.toString()] = {
                amount: bid.amount,
                bidType: bid.bidType,
                hasBid: true
            };
        });
        
        // Add bid information to tasks
        const tasksWithBidInfo = tasks.map(task => {
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
        
        res.json({
            status: "success",
            message: "Tasker feed retrieved successfully",
            tasks: tasksWithBidInfo,
            // taskerCategories: tasker.categories,
            // pagination: {
            //     currentPage: page,
            //     totalPages,
            //     totalTasks,
            //     hasNextPage: page < totalPages,
            //     hasPrevPage: page > 1,
            //     tasksPerPage: limit
            // },
            // filters: {
            //     appliedFilters: filterOptions,
            //     availableFilters: {
            //         biddingOnly: "Show only tasks with bidding enabled",
            //         budget_min: "Minimum budget filter",
            //         budget_max: "Maximum budget filter",
            //         maxDistance: "Maximum distance in miles (default: 200, requires tasker location)"
            //     }
            // }
        });
        
    } catch (error) {
        console.error("Get tasker feed error:", error);
        res.status(500).json({
            status: "error",
            message: "Error retrieving tasker feed",
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
    getTaskerFeed
}; 