import Category from '../models/category.js';
import Task from '../models/task.js';
import Tasker from '../models/tasker.js';
import mongoose from 'mongoose';
import * as Sentry from '@sentry/node';

// Helper function to check if ID is valid
const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

// Create a new category (admin only)
const createCategory = async (req, res) => {
    try {
        const { name, displayName, description } = req.body;
        
        // Validate required fields
        if (!name || !displayName) {
            return res.status(400).json({
                status: "error",
                message: "Category name and display name are required"
            });
        }
        
        // Convert name to lowercase and replace spaces with hyphens
        const normalizedName = name.toLowerCase().trim().replace(/\s+/g, '-');
        
        // Check if category already exists
        const existingCategory = await Category.findOne({ 
            name: normalizedName 
        });
        
        if (existingCategory) {
            return res.status(400).json({
                status: "error",
                message: "Category with this name already exists"
            });
        }
        
        const category = new Category({
            name: normalizedName,
            displayName: displayName.trim(),
            description: description || '',
            createdBy: req.user._id
        });
        
        await category.save();
        
        res.status(201).json({
            status: "success",
            message: "Category created successfully",
            category
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error("Create category error:", error);
        
        // Handle unique index violation
        if (error.code === 11000) {
            return res.status(400).json({
                status: "error",
                message: "Category with this name already exists"
            });
        }
        
        res.status(500).json({
            status: "error",
            message: "Error creating category",
            error: error.message
        });
    }
};

// Get all categories (public endpoint for selection)
const getAllCategories = async (req, res) => {
    try {
        // For public use, only return active categories
        const categories = await Category.find({ isActive: true })
            .select('_id name displayName description parentCategory mainCategory')
            .populate('parentCategory', '_id name displayName')
            .sort({ displayName: 1 });
            
        res.status(200).json({
            status: "success",
            count: categories.length,
            categories
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error("Get all categories error:", error);
        res.status(500).json({
            status: "error",
            message: "Error fetching categories",
            error: error.message
        });
    }
};

// Get all categories for admin (includes inactive)
const getAllCategoriesAdmin = async (req, res) => {
    try {
        const showInactive = req.query.showInactive === 'true';
        const filter = showInactive ? {} : { isActive: true };
        
        const categories = await Category.find(filter)
            .populate('createdBy', 'fullName emailAddress')
            .sort({ displayName: 1 });
            
        res.status(200).json({
            status: "success",
            count: categories.length,
            categories
        });
    } catch (error) {
        console.error("Get all categories admin error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error fetching categories",
            error: error.message
        });
    }
};

// Get a specific category by ID
const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate Object ID
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid category ID format"
            });
        }
        
        const category = await Category.findById(id)
            .populate('createdBy', 'fullName emailAddress');
            
        if (!category) {
            return res.status(404).json({
                status: "error",
                message: "Category not found"
            });
        }
        
        res.status(200).json({
            status: "success",
            category
        });
    } catch (error) {
        console.error("Get category by ID error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error fetching category",
            error: error.message
        });
    }
};

// Update a category (admin only)
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, displayName, description, isActive } = req.body;
        
        // Validate Object ID
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid category ID format"
            });
        }
        
        const category = await Category.findById(id);
        
        if (!category) {
            return res.status(404).json({
                status: "error",
                message: "Category not found"
            });
        }
        
        // Check for duplicate name if name is being updated
        if (name && name !== category.name) {
            const normalizedName = name.toLowerCase().trim().replace(/\s+/g, '-');
            const existingCategory = await Category.findOne({ 
                name: normalizedName,
                _id: { $ne: id }
            });
            
            if (existingCategory) {
                return res.status(400).json({
                    status: "error",
                    message: "Another category with this name already exists"
                });
            }
            category.name = normalizedName;
        }
        
        // Update fields if provided
        if (displayName) category.displayName = displayName.trim();
        if (description !== undefined) category.description = description;
        if (isActive !== undefined) category.isActive = isActive;
        
        await category.save();
        
        res.status(200).json({
            status: "success",
            message: "Category updated successfully",
            category
        });
    } catch (error) {
        console.error("Update category error:", error);
        Sentry.captureException(error);
        
        // Handle unique index violation
        if (error.code === 11000) {
            return res.status(400).json({
                status: "error",
                message: "Another category with this name already exists"
            });
        }
        
        res.status(500).json({
            status: "error",
            message: "Error updating category",
            error: error.message
        });
    }
};

// Deactivate a category (admin only) - safer than deleting
const deactivateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate Object ID
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid category ID format"
            });
        }
        
        const category = await Category.findById(id);
        
        if (!category) {
            return res.status(404).json({
                status: "error",
                message: "Category not found"
            });
        }
        
        // Check if category is being used by any tasks or taskers
    const tasksUsingCategory = await Task.countDocuments({ categories: id });
    const taskersUsingCategory = await Tasker.countDocuments({ categories: id });
        
        if (tasksUsingCategory > 0 || taskersUsingCategory > 0) {
            return res.status(400).json({
                status: "error",
                message: `Cannot deactivate category. It is currently being used by ${tasksUsingCategory} tasks and ${taskersUsingCategory} taskers.`,
                usage: {
                    tasks: tasksUsingCategory,
                    taskers: taskersUsingCategory
                }
            });
        }
        
        category.isActive = false;
        await category.save();
        
        res.status(200).json({
            status: "success",
            message: "Category deactivated successfully"
        });
    } catch (error) {
        console.error("Deactivate category error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error deactivating category",
            error: error.message
        });
    }
};

// Get category usage statistics (admin only)
const getCategoryStats = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid category ID format"
            });
        }
        
        const category = await Category.findById(id);
        
        if (!category) {
            return res.status(404).json({
                status: "error",
                message: "Category not found"
            });
        }
        
        const [tasksCount, taskersCount, recentTasks] = await Promise.all([
            Task.countDocuments({ categories: id }),
            Tasker.countDocuments({ categories: id }),
            Task.find({ categories: id })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('title createdAt status')
        ]);
        
        res.status(200).json({
            status: "success",
            category: {
                _id: category._id,
                name: category.name,
                displayName: category.displayName
            },
            stats: {
                totalTasks: tasksCount,
                totalTaskers: taskersCount,
                recentTasks
            }
        });
    } catch (error) {
        console.error("Get category stats error:", error);
        Sentry.captureException(error);
        res.status(500).json({
            status: "error",
            message: "Error fetching category statistics",
            error: error.message
        });
    }
};

export  {
    createCategory,
    getAllCategories,
    getAllCategoriesAdmin,
    getCategoryById,
    updateCategory,
    deactivateCategory,
    getCategoryStats
}; 