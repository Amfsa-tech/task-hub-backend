import Admin from '../models/admin.js';
import bcrypt from 'bcryptjs';
import { logAdminAction } from '../utils/auditLogger.js';

// GET /api/admin/staff/stats (Matches the 3 Top Cards)
export const getStaffStats = async (req, res) => {
    try {
        // Logic for "Active Today" (Logged in since 12:00 AM)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const [totalAdmin, superAdmin, activeToday] = await Promise.all([
            Admin.countDocuments(),
            Admin.countDocuments({ role: 'super_admin' }),
            // Requires 'lastLogin' field in your Admin model
            Admin.countDocuments({ lastLogin: { $gte: startOfDay } }) 
        ]);

        res.json({
            status: 'success',
            data: {
                totalAdmin,
                activeToday,
                superAdmin
            }
        });
    } catch (error) {
        console.error('Staff stats error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch staff stats' });
    }
};

// GET /api/admin/staff (List View with Filters)
export const getAllStaff = async (req, res) => {
    try {
        const { search, status } = req.query;
        const query = {};

        // 1. Search (Name or Email)
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // 2. Status Filter (Active / Suspended)
        if (status === 'active') query.isActive = true;
        if (status === 'suspended') query.isActive = false;

        const staff = await Admin.find(query)
            .select('-password') // Hide password hash
            .sort({ createdAt: -1 }); // Newest first

        res.json({
            status: 'success',
            results: staff.length,
            staff
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch staff' });
    }
};

// POST /api/admin/staff (Invite Admin Button)
export const createStaff = async (req, res) => {
    try {
        const { firstName, lastName, email, password, role } = req.body;

        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            return res.status(400).json({ status: 'error', message: 'Admin already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newAdmin = await Admin.create({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            role: role || 'support', // Default role
            isActive: true,
            createdAt: new Date()
        });

        await logAdminAction({
            adminId: req.admin._id,
            action: 'CREATE_ADMIN',
            resourceType: 'Admin',
            resourceId: newAdmin._id,
            req
        });

        res.status(201).json({
            status: 'success',
            message: 'New admin invited successfully',
            admin: {
                id: newAdmin._id,
                email: newAdmin.email,
                role: newAdmin.role
            }
        });

    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to create admin' });
    }
};

// PATCH /api/admin/staff/:id (Suspend/Activate Actions)
export const updateStaffStatus = async (req, res) => {
    try {
        const { isActive } = req.body;
        
        // Prevent modifying your own status or other super admins if you aren't one
        const targetAdmin = await Admin.findById(req.params.id);
        if (!targetAdmin) return res.status(404).json({ message: 'Admin not found' });

        if (targetAdmin.role === 'super_admin' && req.admin.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to modify Super Admin' });
        }

        targetAdmin.isActive = isActive;
        await targetAdmin.save();

        await logAdminAction({
            adminId: req.admin._id,
            action: isActive ? 'ACTIVATE_ADMIN' : 'SUSPEND_ADMIN',
            resourceType: 'Admin',
            resourceId: targetAdmin._id,
            req
        });

        res.json({ status: 'success', message: `Admin ${isActive ? 'activated' : 'suspended'}` });

    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Update failed' });
    }
};

export const getStaffById = async (req, res) => {
    try {
        const staffId = req.params.id;

        // 1. Fetch Admin Profile
        const staff = await Admin.findById(staffId).select('-password');
        
        if (!staff) {
            return res.status(404).json({ status: 'error', message: 'Staff member not found' });
        }

        // 2. Fetch Recent Activities (Audit Logs for this specific admin)
        const activities = await AuditLog.find({ admin: staffId })
            .sort({ createdAt: -1 })
            .limit(10);

        // 3. Define Permission Roles (Hardcoded mapping for UI display)
        // You can adjust these based on your actual role definitions
        const rolePermissions = {
            super_admin: [
                'Full System Access',
                'Manage Admins & Staff',
                'Financial Oversight',
                'System Configuration',
                'Database Management'
            ],
            operations: [
                'User and Tasker Management',
                'KYC Verification',
                'Task Management',
                'Payment Oversight',
                'System Logs & Reports'
            ],
            support: [
                'User Disputes',
                'Chat Support',
                'Basic User Management',
                'View Transaction History'
            ],
            trust_safety: [
                'KYC Verification',
                'Flagged Content Review',
                'User Suspension/Banning',
                'Report Resolution'
            ]
        };

        // Get permissions for this user's role (default to empty if role unknown)
        const permissions = rolePermissions[staff.role] || ['Basic View Access'];

        // 4. Format Activity Log for UI
        const formattedActivities = activities.map(log => ({
            id: log._id,
            action: log.action.replace(/_/g, ' '), // Convert "USER_SUSPENDED" to "USER SUSPENDED"
            details: log.details || `Performed action on ${log.resourceType}`,
            date: log.createdAt
        }));

        res.json({
            status: 'success',
            data: {
                profile: {
                    id: staff._id,
                    firstName: staff.firstName,
                    lastName: staff.lastName,
                    email: staff.email,
                    role: staff.role, // e.g., "Operations Admin"
                    phone: staff.phoneNumber || 'N/A', // Ensure this field exists in your Schema or return N/A
                    location: staff.location || 'N/A', // Ensure this field exists in your Schema or return N/A
                    joinedAt: staff.createdAt,
                    isActive: staff.isActive
                },
                permissions: permissions, // Populates the "Permission Access" box
                accountInfo: {
                    adminId: staff._id,
                    role: staff.role,
                    lastUpdated: staff.updatedAt
                },
                recentActivities: formattedActivities // Populates the "Recent Activities" timeline
            }
        });

    } catch (error) {
        console.error('Get staff details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch staff details' });
    }
};