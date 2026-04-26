import KYCVerification from '../models/kycVerification.js';
import { ninVerificationService } from '../services/nin_service.js';
import * as Sentry from '@sentry/node';

/**
 * User or Tasker submits NIN + full name for manual admin review.
 * One-time submission only — no QoreID call, stored as Pending.
 * Requires protectAny middleware (sets req.user and req.userType).
 */
export const submitNINForReview = async (req, res) => {
    try {
        const { nin, fullName } = req.body;

        if (!nin || !fullName) {
            return res.status(400).json({
                status: 'error',
                message: 'nin and fullName are required'
            });
        }

        if (!/^\d{11}$/.test(nin)) {
            return res.status(400).json({
                status: 'error',
                message: 'NIN must be exactly 11 digits'
            });
        }

        const userType = req.userType === 'tasker' ? 'Tasker' : 'User';
        const userId = req.user._id;

        const existing = await KYCVerification.findOne({ user: userId, userType });
        if (existing && !existing.ninResubmissionRequired) {
            return res.status(409).json({
                status: 'error',
                message: 'NIN has already been submitted'
            });
        }

        let kyc;
        if (existing && existing.ninResubmissionRequired) {
            // Update existing record that was flagged for resubmission
            existing.nin = nin;
            existing.maskedNin = nin.slice(0, 3) + '****' + nin.slice(-4);
            existing.ninResubmissionRequired = false;
            existing.status = 'pending';
            existing.verificationData = { fullName };
            kyc = await existing.save();
        } else {
            kyc = await KYCVerification.create({
                user: userId,
                userType,
                nin,
                maskedNin: nin.slice(0, 3) + '****' + nin.slice(-4),
                provider: 'qoreid',
                status: 'pending',
                verificationData: { fullName }
            });
        }

        res.status(201).json({
            status: 'success',
            message: 'NIN submitted successfully. It will be reviewed shortly.',
            kycId: kyc._id
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(error.status || 500).json({
            status: 'error',
            message: error.message || 'Failed to submit NIN'
        });
    }
};

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
            userType: 'User',
            maskedNin: nin.slice(0, 3) + '****' + nin.slice(-4),
            status: result.isVerified ? 'Approved' : 'Pending',
            verificationData: {
                matchStatus: result.validationResult?.matchStatus,
                mismatches: result.validationResult?.mismatches
            },
            verifiedAt: result.isVerified ? new Date() : undefined
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
