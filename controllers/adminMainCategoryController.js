import MainCategory from '../models/mainCategory.js';
import Category from '../models/category.js';
import { logAdminAction } from '../utils/auditLogger.js';

// List all main categories (including inactive)
export const getAllMainCategories = async (req, res) => {
    try {
        const mainCategories = await MainCategory.find().sort({ createdAt: -1 });

        const categoriesWithStats = await Promise.all(mainCategories.map(async (mc) => {
            const subcategoryCount = await Category.countDocuments({ mainCategory: mc._id });
            return {
                _id: mc._id,
                name: mc.name,
                displayName: mc.displayName,
                description: mc.description,
                icon: mc.icon,
                isActive: mc.isActive,
                subcategories: subcategoryCount,
                createdAt: mc.createdAt
            };
        }));

        res.status(200).json({
            status: 'success',
            data: { mainCategories: categoriesWithStats }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to load main categories' });
    }
};

// Create a main category
export const createMainCategory = async (req, res) => {
    try {
        const { name, displayName, description, icon } = req.body;

        if (!name || !displayName) {
            return res.status(400).json({ status: 'error', message: 'Name and display name are required' });
        }

        const normalizedName = name.toLowerCase().trim().replace(/\s+/g, '-');

        const existing = await MainCategory.findOne({ name: normalizedName });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Main category with this name already exists' });
        }

        const mainCategory = await MainCategory.create({
            name: normalizedName,
            displayName: displayName.trim(),
            description: description || '',
            icon: icon || '',
            createdBy: req.admin._id
        });

        await logAdminAction({ adminId: req.admin._id, action: 'CREATE_MAIN_CATEGORY', resourceType: 'MainCategory', resourceId: mainCategory._id, req });

        res.status(201).json({ status: 'success', mainCategory });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ status: 'error', message: 'Main category with this name already exists' });
        }
        res.status(500).json({ status: 'error', message: 'Failed to create main category' });
    }
};

// Update a main category
export const updateMainCategory = async (req, res) => {
    try {
        const { name, displayName, description, icon, isActive } = req.body;

        const mainCategory = await MainCategory.findById(req.params.id);
        if (!mainCategory) {
            return res.status(404).json({ status: 'error', message: 'Main category not found' });
        }

        if (name) mainCategory.name = name.toLowerCase().trim().replace(/\s+/g, '-');
        if (displayName) mainCategory.displayName = displayName;
        if (description !== undefined) mainCategory.description = description;
        if (icon !== undefined) mainCategory.icon = icon;
        if (isActive !== undefined) mainCategory.isActive = isActive;

        await mainCategory.save();

        await logAdminAction({ adminId: req.admin._id, action: 'UPDATE_MAIN_CATEGORY', resourceType: 'MainCategory', resourceId: mainCategory._id, req });

        res.status(200).json({ status: 'success', mainCategory });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to update main category' });
    }
};

// Delete a main category (only if no subcategories reference it)
export const deleteMainCategory = async (req, res) => {
    try {
        const mainCategory = await MainCategory.findById(req.params.id);
        if (!mainCategory) {
            return res.status(404).json({ status: 'error', message: 'Main category not found' });
        }

        const subcategoryCount = await Category.countDocuments({ mainCategory: mainCategory._id });
        if (subcategoryCount > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Cannot delete main category. It has ${subcategoryCount} subcategories. Please reassign or delete them first.`
            });
        }

        await MainCategory.findByIdAndDelete(req.params.id);

        await logAdminAction({ adminId: req.admin._id, action: 'DELETE_MAIN_CATEGORY', resourceType: 'MainCategory', resourceId: req.params.id, req });

        res.status(200).json({ status: 'success', message: 'Main category deleted successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to delete main category' });
    }
};
