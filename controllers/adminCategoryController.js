import Category from '../models/category.js';
import Task from '../models/task.js';
import Tasker from '../models/tasker.js';
import { logAdminAction } from '../utils/auditLogger.js';

// --- 1. MAIN CATEGORY PAGE (List & Top Stats) ---
export const getAdminCategoriesDashboard = async (req, res) => {
    try {
        // Only count MAIN categories for the top stats
        const activeCategories = await Category.countDocuments({ isActive: true, parentCategory: null });
        const closedCategories = await Category.countDocuments({ isActive: false, parentCategory: null });
        const totalServices = await Task.countDocuments(); 

        // Fetch only MAIN categories for the primary table
        const mainCategories = await Category.find({ parentCategory: null }).sort({ createdAt: -1 });
        
        const categoriesWithStats = await Promise.all(mainCategories.map(async (cat) => {
            // Find sub-categories for this specific main category
            const subCategories = await Category.find({ parentCategory: cat._id }).select('_id');
            const subCatIds = subCategories.map(sc => sc._id);
            
            // Tasks might be tagged with the main category OR the sub-category
            const allRelevantCatIds = [cat._id, ...subCatIds];
            
            // NEW: Querying against the new mainCategory and subCategory fields
            const serviceCount = await Task.countDocuments({ 
                $or: [
                    { mainCategory: { $in: allRelevantCatIds } },
                    { subCategory: { $in: allRelevantCatIds } }
                ]
            });
            
            return {
                _id: cat._id,
                name: cat.name, 
                displayName: cat.displayName, 
                description: cat.description,
                subCategoryCount: subCatIds.length,
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
        console.error(error);
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

        // Fetch actual sub-category documents to list in the new UI table
        const subCategories = await Category.find({ parentCategory: category._id }).sort({ createdAt: -1 });
        const subCatIds = subCategories.map(sc => sc._id);
        const allRelevantCatIds = [category._id, ...subCatIds];

        // NEW: Query definitions using the updated schema fields
        const taskQuery = { 
            $or: [
                { mainCategory: { $in: allRelevantCatIds } },
                { subCategory: { $in: allRelevantCatIds } }
            ]
        };

        const taskerQuery = { 
            $or: [
                { mainCategories: { $in: allRelevantCatIds } },
                { subCategories: { $in: allRelevantCatIds } }
            ]
        };

        // Stats now aggregate across the main category AND all its sub-categories
        const totalServices = await Task.countDocuments(taskQuery);
        const totalTaskers = await Tasker.countDocuments(taskerQuery);
        const activeTaskers = await Tasker.countDocuments({ ...taskerQuery, isActive: true });

        const revenueAgg = await Task.aggregate([
            { 
                $match: { 
                    $or: [
                        { mainCategory: { $in: allRelevantCatIds } },
                        { subCategory: { $in: allRelevantCatIds } }
                    ],
                    status: 'completed' 
                } 
            },
            { $group: { _id: null, total: { $sum: '$budget' } } }
        ]);
        const revenue = revenueAgg[0]?.total || 0;

        const tasks = await Task.find(taskQuery)
            .populate('user', 'fullName')
            .select('title budget status createdAt user')
            .sort({ createdAt: -1 })
            .limit(20); 

        const taskers = await Tasker.find(taskerQuery)
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
                    displayName: category.displayName, 
                    description: category.description,
                    isActive: category.isActive,
                    minimumPrice: category.minimumPrice || 0 
                },
                stats: {
                    totalServices,
                    subCategoryCount: subCategories.length,
                    activeServices: tasks.filter(t => t.status !== 'cancelled').length,
                    activeTaskers,
                    totalTaskers,
                    revenue
                },
                subCategories: subCategories.map(sc => ({
                    _id: sc._id,
                    displayName: sc.displayName,
                    isActive: sc.isActive
                })),
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
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Failed to load category details' });
    }
};

// --- 3. CREATE CATEGORY & SUB-CATEGORY (Admin Modal) ---
export const createAdminCategory = async (req, res) => {
    try {
        const { name, displayName, description, minimumPrice, isActive, parentCategory } = req.body;
        
        const normalizedName = name.toLowerCase().trim().replace(/\s+/g, '-');
        
        const existing = await Category.findOne({ name: normalizedName });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Category name exists' });
        }

        if (parentCategory) {
            const parentExists = await Category.findById(parentCategory);
            if (!parentExists) {
                return res.status(404).json({ status: 'error', message: 'Parent category not found' });
            }
        }

        const category = await Category.create({
            name: normalizedName,
            displayName: displayName || name,
            description,
            minimumPrice: minimumPrice || 0,
            isActive: isActive !== undefined ? isActive : true,
            parentCategory: parentCategory || null,
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
        const { name, displayName, description, minimumPrice, isActive, parentCategory } = req.body;
        
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ status: 'error', message: 'Category not found' });

        if (name) category.name = name.toLowerCase().trim().replace(/\s+/g, '-');
        if (displayName) category.displayName = displayName;
        if (description !== undefined) category.description = description;
        if (minimumPrice !== undefined) category.minimumPrice = minimumPrice;
        if (isActive !== undefined) category.isActive = isActive;
        if (parentCategory !== undefined) category.parentCategory = parentCategory;

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

        const subCategoryCount = await Category.countDocuments({ parentCategory: categoryId });
        if (subCategoryCount > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Cannot delete category. It contains ${subCategoryCount} sub-categories. Please delete or reassign them first.`
            });
        }

        // NEW: Check if tasks or taskers are actively using it using the new schema fields
        const tasksUsingCategory = await Task.countDocuments({ 
            $or: [{ mainCategory: categoryId }, { subCategory: categoryId }] 
        });
        const taskersUsingCategory = await Tasker.countDocuments({ 
            $or: [{ mainCategories: categoryId }, { subCategories: categoryId }] 
        });

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