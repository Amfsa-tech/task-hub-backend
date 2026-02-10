export const requireKyc = (req, res, next) => {
    if (!req.user.isKYCVerified) {
        return res.status(403).json({
            status: 'error',
            message: 'KYC verification required to perform this action'
        });
    }
    next();
};