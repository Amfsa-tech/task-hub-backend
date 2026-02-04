// Restrict admin routes by role
export const allowAdminRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                status: 'error',
                message: 'Admin authentication required'
            });
        }

        if (!allowedRoles.includes(req.admin.role)) {
            return res.status(403).json({
                status: 'error',
                message: 'Insufficient admin permissions'
            });
        }

        next();
    };
};
