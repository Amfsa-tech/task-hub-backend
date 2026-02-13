import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/admin.js';
import { JWT_SECRET } from '../utils/authUtils.js';
import { logAdminAction } from '../utils/auditLogger.js'; // <--- Don't forget this import!

export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'Email and password are required' });
        }

        const admin = await Admin.findOne({ email }).select('+password');

        if (!admin) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        if (!admin.isActive) {
            return res.status(403).json({ status: 'error', message: 'Admin account is deactivated' });
        }

        // Check if locked (if your model supports it)
        if (admin.isLocked && admin.lockUntil > Date.now()) {
            return res.status(403).json({ status: 'error', message: 'Admin account is locked' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }

        // --- 1. UPDATE LAST LOGIN (Do this BEFORE sending response) ---
        admin.lastLogin = new Date();
        await admin.save();

        // --- 2. LOG THE ACTION (For Dashboard Audit Trail) ---
        await logAdminAction({
            adminId: admin._id,
            action: 'ADMIN_LOGIN',
            resourceType: 'System',
            resourceId: admin._id,
            req
        });

        // --- 3. GENERATE TOKEN ---
        const token = jwt.sign(
            { id: admin._id, role: admin.role },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        // --- 4. SEND RESPONSE ---
        res.status(200).json({
            status: 'success',
            message: 'Admin login successful',
            token,
            admin: {
                id: admin._id,
                name: admin.name, // Ensure fields match your model
                email: admin.email,
                role: admin.role,
                lastLogin: admin.lastLogin,
                location: admin.location,
                phoneNumber: admin.phoneNumber
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error during admin login'
        });
    }
};