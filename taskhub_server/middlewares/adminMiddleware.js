import verify from 'jsonwebtoken';
import User from '../models/user.js';

// Middleware to protect admin routes
export const protectAdmin = async (req, res, next) => {
    try {
        let token;

        // Check for token in Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                status: "error",
                message: "Access denied. No token provided."
            });
        }

        // Verify token
        const decoded = verify(token, "admin");
        
        // Get user from database
        const user = await findById(decoded.id);
        
        if (!user) {
            return res.status(401).json({
                status: "error",
                message: "Access denied. User not found."
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({
                status: "error",
                message: "Access denied. Account is deactivated."
            });
        }

        // Check if user is admin
        if (!user.isAdmin) {
            return res.status(403).json({
                status: "error",
                message: "Access denied. Admin privileges required."
            });
        }

        // Check if account is locked
        if (user.isLocked) {
            return res.status(401).json({
                status: "error",
                message: "Access denied. Account is temporarily locked."
            });
        }

        // Add user to request object
        req.user = user;
        next();
        
    } catch (error) {
        console.error("Admin middleware error:", error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                status: "error",
                message: "Access denied. Invalid token."
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: "error",
                message: "Access denied. Token expired."
            });
        }
        
        res.status(500).json({
            status: "error",
            message: "Server error during authentication",
            error: error.message
        });
    }
};

export default {
    protectAdmin
}; 