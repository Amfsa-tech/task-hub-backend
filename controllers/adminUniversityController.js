import University from '../models/university.js';
import Task from '../models/task.js';
import Tasker from '../models/tasker.js';
import { logAdminAction } from '../utils/auditLogger.js';

// List all universities (including inactive)
export const getAllUniversities = async (req, res) => {
    try {
        const universities = await University.find().sort({ name: 1 });

        res.status(200).json({
            status: 'success',
            data: { universities }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to load universities' });
    }
};

// Create a university
export const createUniversity = async (req, res) => {
    try {
        const { name, abbreviation, state, location, logo } = req.body;

        if (!name) {
            return res.status(400).json({ status: 'error', message: 'University name is required' });
        }

        const existing = await University.findOne({ name: name.trim() });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'University with this name already exists' });
        }

        const university = await University.create({
            name: name.trim(),
            abbreviation: abbreviation || '',
            state: state || '',
            location: location || '',
            logo: logo || '',
            createdBy: req.admin._id
        });

        await logAdminAction({ adminId: req.admin._id, action: 'CREATE_UNIVERSITY', resourceType: 'University', resourceId: university._id, req });

        res.status(201).json({ status: 'success', university });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ status: 'error', message: 'University with this name already exists' });
        }
        res.status(500).json({ status: 'error', message: 'Failed to create university' });
    }
};

// Update a university
export const updateUniversity = async (req, res) => {
    try {
        const { name, abbreviation, state, location, logo, isActive } = req.body;

        const university = await University.findById(req.params.id);
        if (!university) {
            return res.status(404).json({ status: 'error', message: 'University not found' });
        }

        if (name) university.name = name.trim();
        if (abbreviation !== undefined) university.abbreviation = abbreviation;
        if (state !== undefined) university.state = state;
        if (location !== undefined) university.location = location;
        if (logo !== undefined) university.logo = logo;
        if (isActive !== undefined) university.isActive = isActive;

        await university.save();

        await logAdminAction({ adminId: req.admin._id, action: 'UPDATE_UNIVERSITY', resourceType: 'University', resourceId: university._id, req });

        res.status(200).json({ status: 'success', university });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to update university' });
    }
};

// Delete a university (only if no tasks or taskers reference it)
export const deleteUniversity = async (req, res) => {
    try {
        const university = await University.findById(req.params.id);
        if (!university) {
            return res.status(404).json({ status: 'error', message: 'University not found' });
        }

        const tasksUsing = await Task.countDocuments({ university: university._id });
        const taskersUsing = await Tasker.countDocuments({ university: university._id });

        if (tasksUsing > 0 || taskersUsing > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Cannot delete university. It is used by ${tasksUsing} tasks and ${taskersUsing} taskers.`
            });
        }

        await University.findByIdAndDelete(req.params.id);

        await logAdminAction({ adminId: req.admin._id, action: 'DELETE_UNIVERSITY', resourceType: 'University', resourceId: req.params.id, req });

        res.status(200).json({ status: 'success', message: 'University deleted successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to delete university' });
    }
};
