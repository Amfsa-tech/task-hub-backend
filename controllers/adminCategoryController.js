import Category from '../models/category.js';
import Task from '../models/task.js';
import Tasker from '../models/tasker.js';
import { logAdminAction } from '../utils/auditLogger.js';

// --- 1. MAIN CATEGORY PAGE (List & Top Stats) ---
export const getAdminCategoriesDashboard = async (req, res) => {
    try {
        const activeCategories = await Category.countDocuments({ isActive: true });
        const closedCategories = await Category.countDocuments({ isActive: false });
        const totalServices = await Task.countDocuments(); 

        const categories = await Category.find().sort({ createdAt: -1 });
        
        const categoriesWithStats = await Promise.all(categories.map(async (cat) => {
            const serviceCount = await Task.countDocuments({ categories: cat._id });
            return {
                _id: cat._id,
                name: cat.name, 
                displayName: cat.displayName, // Applied the display name fix here
                description: cat.description,
                services: serviceCount,
                isActive: cat.isActive
            };
        }));

        res.status(200).json({
            status: 'success',
            data: {
                stats: {
                    activeCategories,
                    closedCategories,
                    totalServices
                },
                categories: categoriesWithStats
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to load category dashboard' });
    }
};

// --- 2. CATEGORY DETAILS PAGE (Drill-down view) ---
export const getAdminCategoryDetails = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const category = await Category.findById(categoryId);

        if (!category) {
            return res.status(404).json({ status: 'error', message: 'Category not found' });
        }

        const totalServices = await Task.countDocuments({ categories: categoryId });
        const totalTaskers = await Tasker.countDocuments({ categories: categoryId });
        const activeTaskers = await Tasker.countDocuments({ categories: categoryId, isActive: true });

        const revenueAgg = await Task.aggregate([
            { $match: { categories: category._id, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$budget' } } }
        ]);
        const revenue = revenueAgg[0]?.total || 0;

        const tasks = await Task.find({ categories: categoryId })
            .populate('user', 'fullName')
            .select('title budget status createdAt user')
            .sort({ createdAt: -1 })
            .limit(20); 

        const taskers = await Tasker.find({ categories: categoryId })
            .select('firstName lastName emailAddress isActive verifyIdentity updatedAt profilePicture')
            .sort({ updatedAt: -1 })
            .limit(20);

        const mappedTaskers = taskers.map(t => ({
            _id: t._id,
            fullName: `${t.firstName} ${t.lastName}`,
            emailAddress: t.emailAddress,
            profilePicture: t.profilePicture || '',
            isActive: t.isActive,
            verifyIdentity: t.verifyIdentity,
            lastActive: t.updatedAt
        }));

        res.status(200).json({
            status: 'success',
            data: {
                category: {
                    _id: category._id,
                    name: category.name,
                    displayName: category.displayName, // Applied the display name fix here
                    description: category.description,
                    isActive: category.isActive,
                    minimumPrice: category.minimumPrice || 0 
                },
                stats: {
                    totalServices,
                    activeTaskers,
                    totalTaskers,
                    revenue
                },
                tasks: tasks.map(t => ({
                    _id: t._id,
                    title: t.title,
                    postedBy: t.user?.fullName || 'Unknown',
                    budget: t.budget,
                    status: t.status,
                    date: t.createdAt
                })),
                taskers: mappedTaskers
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to load category details' });
    }
};

// --- 3. CREATE CATEGORY (Admin Modal) ---
export const createAdminCategory = async (req, res) => {
    try {
        const { name, displayName, description, minimumPrice, isActive } = req.body;
        
        const normalizedName = name.toLowerCase().trim().replace(/\s+/g, '-');
        
        const existing = await Category.findOne({ name: normalizedName });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Category name exists' });
        }

        const category = await Category.create({
            name: normalizedName,
            displayName: displayName || name,
            description,
            minimumPrice: minimumPrice || 0,
            isActive: isActive !== undefined ? isActive : true,
            createdBy: req.admin._id 
        });

        await logAdminAction({ adminId: req.admin._id, action: 'CREATE_CATEGORY', resourceType: 'Category', resourceId: category._id, req });

        res.status(201).json({ status: 'success', category });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to create category' });
    }
};

// --- 4. UPDATE / TOGGLE CATEGORY (Admin Modal) ---
export const updateAdminCategory = async (req, res) => {
    try {
        const { name, displayName, description, minimumPrice, isActive } = req.body;
        
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ status: 'error', message: 'Category not found' });

        if (name) category.name = name.toLowerCase().trim().replace(/\s+/g, '-');
        if (displayName) category.displayName = displayName;
        if (description !== undefined) category.description = description;
        if (minimumPrice !== undefined) category.minimumPrice = minimumPrice;
        if (isActive !== undefined) category.isActive = isActive;

        await category.save();

        await logAdminAction({ adminId: req.admin._id, action: 'UPDATE_CATEGORY', resourceType: 'Category', resourceId: category._id, req });

        res.status(200).json({ status: 'success', category });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to update category' });
    }
};

// --- 5. DELETE CATEGORY (Admin Action) ---
export const deleteAdminCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const category = await Category.findById(categoryId);

        if (!category) {
            return res.status(404).json({ status: 'error', message: 'Category not found' });
        }

        // Safety check: Prevent deletion if tasks or taskers are actively using it
        const tasksUsingCategory = await Task.countDocuments({ categories: categoryId });
        const taskersUsingCategory = await Tasker.countDocuments({ categories: categoryId });

        if (tasksUsingCategory > 0 || taskersUsingCategory > 0) {
            return res.status(400).json({ 
                status: 'error', 
                message: `Cannot delete category. It is used by ${tasksUsingCategory} tasks and ${taskersUsingCategory} taskers. Please reassign them or deactivate the category instead.` 
            });
        }

        await Category.findByIdAndDelete(categoryId);

        await logAdminAction({ 
            adminId: req.admin._id, 
            action: 'DELETE_CATEGORY', 
            resourceType: 'Category', 
            resourceId: categoryId, 
            req 
        });

        res.status(200).json({ status: 'success', message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to delete category' });
    }
};