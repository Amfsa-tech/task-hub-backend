import KYCVerification from '../models/kycVerification.js';
import { verifyNINWithVuvaa } from '../services/vuvaa_nin_service.js'; // <-- NEW IMPORT
import crypto from 'crypto'; // Needed to generate a unique reference_id

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
        if (existing) {
            return res.status(409).json({
                status: 'error',
                message: 'NIN has already been submitted'
            });
        }

        const kyc = await KYCVerification.create({
            user: userId,
            userType,
            maskedNin: nin.slice(0, 3) + '****' + nin.slice(-4),
            provider: 'qoreid',
            status: 'Pending',
            verificationData: { fullName }
        });

        res.status(201).json({
            status: 'success',
            message: 'NIN submitted successfully. It will be reviewed shortly.',
            kycId: kyc._id
        });
    } catch (error) {
        res.status(error.status || 500).json({
            status: 'error',
            message: error.message || 'Failed to submit NIN'
        });
    }
};

export const submitNIN = async (req, res) => {
    try {
        // 1. We ONLY ask the frontend for the NIN now!
        const { nin } = req.body; 

        if (!nin) {
            return res.status(400).json({ status: 'error', message: 'NIN is strictly required' });
        }

        // 2. Generate the Unique Reference ID
        const referenceId = `REF-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        // 3. CALL VUVAA SERVICE FIRST
        const result = await verifyNINWithVuvaa(nin, referenceId);

        // 4. If Vuvaa failed, return immediately
        if (!result.isVerified) {
             return res.status(400).json({
                status: 'error',
                message: 'NIN verification failed or pending manual review',
                isVerified: false,
                vuvaaMessage: result.message
            });
        }

        // 5. SECURITY CHECK: Validate Age based on the REAL government data
        // Vuvaa returns DOB in "DD-MM-YYYY" format (e.g., "11-11-1995")
        const nimcDobString = result.data.dob; 
        if (nimcDobString) {
            const [day, month, year] = nimcDobString.split('-');
            const birth = new Date(year, month - 1, day);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                age--;
            }

            if (age < 18) {
                return res.status(400).json({
                    status: 'error',
                    message: `KYC rejected: User is ${age} years old. Must be 18 or older.`
                });
            }
        }

        // 6. Update the KYC model with the Vuvaa response data
        const kyc = await KYCVerification.create({
            user: req.user._id,
            userType: req.userType === 'tasker' ? 'Tasker' : 'User', 
            maskedNin: nin.slice(0, 3) + '****' + nin.slice(-4),
            provider: 'vuvaa', 
            status: 'approved', 
            verificationData: result.data, // Dump the entire NIMC profile in!
            verifiedAt: new Date()
        });

        // 7. Send final success to frontend
        res.json({
            status: 'success',
            message: 'NIN verified successfully',
            isVerified: true,
            kycId: kyc._id,
            ninDetails: result.data 
        });

    } catch (error) {
        res.status(error.status || 500).json({
            status: 'error',
            message: error.message || 'NIN verification failed'
        });
    }
};
