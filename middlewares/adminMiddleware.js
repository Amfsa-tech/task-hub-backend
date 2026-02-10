import jwt from 'jsonwebtoken';
import Admin from '../models/admin.js';
import { JWT_SECRET } from '../utils/authUtils.js';

// Protect admin-only routes
export const protectAdmin = async (req, res, next) => {
    try {
        let token;
        const authHeader = req.headers.authorization || '';

        if (authHeader.toLowerCase().startsWith('bearer')) {
            token = authHeader.split(' ')[1];
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return res.status(401).json({ status: 'error', message: 'Admin access denied' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded || !decoded.id) {
            return res.status(401).json({ status: 'error', message: 'Invalid token payload' });
        }

        const admin = await Admin.findById(decoded.id).select('-password');

        if (!admin || !admin.isActive) {
            return res.status(401).json({ status: 'error', message: 'Admin not authorized' });
        }

        req.admin = admin;
        next();

    } catch (error) {
        return res.status(401).json({ status: 'error', message: 'Invalid or expired admin token' });
    }
};
