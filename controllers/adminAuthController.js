import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/admin.js';
import { JWT_SECRET } from '../utils/authUtils.js';

export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Email and password are required'
            });
        }

        const admin = await Admin.findOne({ email }).select('+password');

        if (!admin) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        if (!admin.isActive) {
            return res.status(403).json({
                status: 'error',
                message: 'Admin account is deactivated'
            });
        }

        if (admin.isLocked) {
            return res.status(403).json({
                status: 'error',
                message: 'Admin account is locked'
            });
        }

        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        const token = jwt.sign(
            { id: admin._id, role: admin.role },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({
            status: 'success',
            message: 'Admin login successful',
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role
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
