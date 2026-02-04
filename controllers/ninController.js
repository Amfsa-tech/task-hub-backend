import KYCVerification from '../models/kycVerification.js';
import { ninVerificationService } from '../services/nin_service.js';

export const submitNIN = async (req, res) => {
    try {
        const { nin, firstName, lastName, dob, gender, phoneNumber, email } = req.body;

        // ✅ Validation MUST be inside the function
        if (!nin || !firstName || !lastName || !dob) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }
        const calculateAge = (dob) => {
                const birth = new Date(dob);
                const today = new Date();
                let age = today.getFullYear() - birth.getFullYear();
                const m = today.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                    age--;
                }
                return age;
                };

                const age = calculateAge(dob);

                if (age < 18) {
                return res.status(400).json({
                    status: 'error',
                    message: 'KYC verification is not allowed for users under 18'
                });
                }

        const result = await ninVerificationService.verifyUserIdentity(nin, {
            firstName,
            lastName,
            dob,
            gender,
            phoneNumber,
            email
        });

        const kyc = await KYCVerification.create({
            user: req.user._id,
            nin,
            status: 'pending',
            verificationSummary: {
                matchStatus: result.validationResult?.matchStatus,
                mismatches: result.validationResult?.mismatches
            },
            verifiedAt: new Date()
        });

        res.json({
            status: 'success',
            message: 'NIN submitted for verification',
            isVerified: result.isVerified,
            kycId: kyc._id
        });

    } catch (error) {
        res.status(error.status || 500).json({
            status: 'error',
            message: error.message || 'NIN verification failed'
        });
    }
};
