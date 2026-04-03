import adminAuditLog from '../models/adminAuditLog.js'; 
import Admin from '../models/admin.js';
import AdminInvite from '../models/adminInvite.js'; // NEW IMPORT
import bcrypt from 'bcryptjs';
import crypto from 'crypto'; // NEW IMPORT
import { logAdminAction } from '../utils/auditLogger.js';
import { sendAdminInviteEmail } from '../utils/authUtils.js'; // NEW IMPORT

// GET /api/admin/staff/stats (Matches the 3 Top Cards)
export const getStaffStats = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const [totalAdmin, superAdmin, activeToday] = await Promise.all([
            Admin.countDocuments(),
            Admin.countDocuments({ role: 'super_admin' }),
            Admin.countDocuments({ lastLogin: { $gte: startOfDay } }) 
        ]);

        res.json({
            status: 'success',
            data: { totalAdmin, activeToday, superAdmin }
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

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (status === 'active') query.isActive = true;
        if (status === 'suspended') query.isActive = false;

        const staff = await Admin.find(query)
            .select('-password') 
            .sort({ createdAt: -1 }); 

        res.json({
            status: 'success',
            results: staff.length,
            staff
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch staff' });
    }
};

// POST /api/admin/staff/invite (Invite Admin Button from Figma)
export const inviteAdmin = async (req, res) => {
    try {
        const { email, role } = req.body;

        if (!email) {
            return res.status(400).json({ status: 'error', message: 'Email address is required' });
        }

        // 1. Check if admin already exists
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            return res.status(400).json({ status: 'error', message: 'An admin with this email already exists' });
        }

        // 2. Generate a secure random token
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        // 3. Save or update the invitation
        let invite = await AdminInvite.findOne({ email });
        
        if (invite) {
            // Update existing invite with new token and expiry
            invite.token = hashedToken;
            invite.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
            invite.role = role || invite.role;
            await invite.save();
        } else {
            // Create new invite
            await AdminInvite.create({
                email,
                role: role || 'support', 
                token: hashedToken,
                invitedBy: req.admin._id,
                expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
            });
        }

        // 4. Send the email with the UNHASHED token
        await sendAdminInviteEmail(email, rawToken);

        await logAdminAction({
            adminId: req.admin._id,
            action: 'INVITED_ADMIN',
            resourceType: 'AdminInvite',
            details: `Invited email: ${email}`,
            req
        });

        res.status(200).json({
            status: 'success',
            message: 'Invitation email sent successfully'
        });

    } catch (error) {
        console.error('Invite Admin error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send invitation' });
    }
};

// POST /api/admin/staff/setup (When the invited user clicks the email link)
export const setupAdminAccount = async (req, res) => {
    try {
        const { token, firstName, lastName, password } = req.body;

        if (!token || !firstName || !lastName || !password) {
            return res.status(400).json({ status: 'error', message: 'All fields are required to setup account' });
        }

        if (password.length < 6) {
            return res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters' });
        }

        // 1. Hash the provided token to compare with database
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // 2. Find valid invitation
        const invite = await AdminInvite.findOne({
            token: hashedToken,
            expiresAt: { $gt: Date.now() } // Ensure it hasn't expired
        });

        if (!invite) {
            return res.status(400).json({ status: 'error', message: 'Invalid or expired invitation link' });
        }

        // 3. Hash password and create the official Admin record
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newAdmin = await Admin.create({
            name: `${firstName} ${lastName}`, // <--- FIX APPLIED HERE
            firstName,
            lastName,
            email: invite.email,
            password: hashedPassword,
            role: invite.role,
            isActive: true
        });

        // 4. Delete the invitation so it can't be used again
        await AdminInvite.findByIdAndDelete(invite._id);

        res.status(201).json({
            status: 'success',
            message: 'Admin account setup successfully. You can now log in.',
            admin: {
                id: newAdmin._id,
                email: newAdmin.email,
                role: newAdmin.role
            }
        });

    } catch (error) {
        console.error('Setup Admin error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to setup admin account' });
    }
};

// PATCH /api/admin/staff/:id (Suspend/Activate Actions)
export const updateStaffStatus = async (req, res) => {
    try {
        const { isActive } = req.body;
        
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
        const staff = await Admin.findById(staffId).select('-password');
        
        if (!staff) return res.status(404).json({ status: 'error', message: 'Staff member not found' });

        const activities = await adminAuditLog.find({ admin: staffId })
            .sort({ createdAt: -1 })
            .limit(10);

        const rolePermissions = {
            super_admin: ['Full System Access', 'Manage Admins & Staff', 'Financial Oversight', 'System Configuration', 'Database Management'],
            operations: ['User and Tasker Management', 'KYC Verification', 'Task Management', 'Payment Oversight', 'System Logs & Reports'],
            support: ['User Disputes', 'Chat Support', 'Basic User Management', 'View Transaction History'],
            trust_safety: ['KYC Verification', 'Flagged Content Review', 'User Suspension/Banning', 'Report Resolution']
        };

        const permissions = rolePermissions[staff.role] || ['Basic View Access'];

        const formattedActivities = activities.map(log => ({
            id: log._id,
            action: log.action.replace(/_/g, ' '), 
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
                    role: staff.role, 
                    phone: staff.phoneNumber || 'N/A', 
                    location: staff.location || 'N/A', 
                    joinedAt: staff.createdAt,
                    isActive: staff.isActive
                },
                permissions: permissions, 
                accountInfo: {
                    adminId: staff._id,
                    role: staff.role,
                    lastUpdated: staff.updatedAt
                },
                recentActivities: formattedActivities 
            }
        });

    } catch (error) {
        console.error('Get staff details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch staff details' });
    }
};