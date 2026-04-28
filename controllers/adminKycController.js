import KYCVerification from '../models/kycVerification.js';
import User from '../models/user.js';
import Tasker from '../models/tasker.js'; 
import { sendKycNotification } from '../services/onesignal.js';
import { logAdminAction } from '../utils/auditLogger.js';
import { saveNotification } from '../services/notificationService.js';
import { escapeRegex } from '../utils/searchUtils.js';
import { baseLayout } from '../utils/taskerEmailTemplates.js'; 
import { sendEmail } from '../services/emailService.js';

// GET /api/admin/kyc/stats
export const getKycStats = async (req, res) => {
    try {
        const [
            total,
            pending,
            approved,
            rejected,
            verifiedUsers,
            verifiedTaskers 
        ] = await Promise.all([
            KYCVerification.countDocuments(),
            KYCVerification.countDocuments({ status: 'pending' }),
            KYCVerification.countDocuments({ status: 'approved' }),
            KYCVerification.countDocuments({ status: 'rejected' }),
            User.countDocuments({ isKYCVerified: true }),
            Tasker.countDocuments({ verifyIdentity: true }) 
        ]);

        res.json({
            status: 'success',
            data: { total, pending, approved, rejected, verifiedUsers, verifiedTaskers }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch KYC statistics' });
    }
};

// GET /api/admin/kyc
export const getAllKycRequests = async (req, res) => {
    try {
        const { status, search, page = 1, limit = 10, startDate, endDate } = req.query;

        const filter = {};

        if (status && status !== 'All') filter.status = status;

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            filter.$or = [
                { idNumber: { $regex: escapeRegex(search), $options: 'i' } } 
            ];
        }

        // OPTIMIZATION: Run the find list and the total count in parallel
        const [kycRecords, total] = await Promise.all([
            KYCVerification.find(filter)
                .populate('user', 'fullName emailAddress firstName lastName profilePicture')
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit),
            KYCVerification.countDocuments(filter)
        ]);

        res.json({
            status: 'success',
            results: kycRecords.length,
            totalRecords: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            records: kycRecords
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch KYC records' });
    }
};


// PATCH /api/admin/kyc/:id/approve
export const approveKyc = async (req, res) => {
    try {
        const kyc = await KYCVerification.findById(req.params.id);

        if (!kyc) {
            return res.status(404).json({ status: 'error', message: 'KYC record not found' });
        }

        if (kyc.status === 'approved') {
            return res.status(400).json({ status: 'error', message: 'KYC already approved' });
        }

        // 1. Update KYC Record
        kyc.status = 'approved';
        kyc.verifiedAt = new Date();
        kyc.reviewedBy = req.admin._id;
        kyc.reviewedAt = new Date();
        await kyc.save();

        // 2. Identify and Update the Correct Model (User vs Tasker)
        let targetAccount;
        if (kyc.userType === 'Tasker') {
            targetAccount = await Tasker.findByIdAndUpdate(
                kyc.user,
                { verifyIdentity: true },
                { new: true }
            );
        } else {
            targetAccount = await User.findByIdAndUpdate(
                kyc.user,
                { isKYCVerified: true },
                { new: true }
            );
        }

        // 3. Handle Notifications if account exists
        if (targetAccount) {

            if (targetAccount.notificationId) {
                await sendKycNotification(targetAccount.notificationId, 'approved');
            }

            await saveNotification({
                userId: targetAccount._id,
                title: 'KYC Approved',
                message: 'Your identity verification has been approved.',
                type: 'kyc'
            });

            const recipientEmail = targetAccount.email || targetAccount.emailAddress; 

            if (recipientEmail) {
                const title = 'KYC Verification Approved 🎉';
                const bodyHtml = `
                    <p>Hello ${targetAccount.firstName || targetAccount.fullName || ''},</p>
                    <p>We are pleased to inform you that your KYC verification on Taskhub has been successfully <strong>approved</strong>. You now have full access to all features on the platform.</p>
                    <p>Thank you for completing the verification process. If you have any questions or need assistance, feel free to reach out to our support team.</p>
                    
                    <div style="text-align: center; margin-top: 25px;">
                        <a href="${process.env.FRONTEND_URL || 'https://www.ngtaskhub.com'}/login" class="cta-button" style="background-color: #8600AF; color: white; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: 600; display: inline-block;">Go to Dashboard</a>
                    </div>
                `;

                await sendEmail({
                    to: recipientEmail,
                    subject: 'Your KYC Verification is Approved! 🎉',
                    html: baseLayout(title, bodyHtml) 
                });
            }
        }

        // 4. Log Admin Action
        await logAdminAction({
            adminId: req.admin._id,
            action: 'APPROVE_KYC',
            resourceType: 'KYC',
            resourceId: kyc._id,
            req
        });

        res.json({
            status: 'success',
            message: 'KYC approved successfully',
            data: kyc
        });

    } catch (error) {
        console.error('Approve KYC error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to approve KYC' });
    }
};

export const rejectKyc = async (req, res) => {
    try {
        const { reason } = req.body;
        const kyc = await KYCVerification.findById(req.params.id);

        if (!kyc) {
            return res.status(404).json({ status: 'error', message: 'KYC record not found' });
        }

        // 1. Update KYC Record
        kyc.status = 'rejected';
        kyc.rejectionReason = reason || 'Verification failed';
        kyc.reviewedBy = req.admin._id;
        kyc.reviewedAt = new Date();
        await kyc.save();

        // 2. Reset Verification Flags in Models
        let targetAccount;
        if (kyc.userType === 'Tasker') {
            targetAccount = await Tasker.findByIdAndUpdate(
                kyc.user,
                { verifyIdentity: false },
                { new: true }
            );
        } else {
            targetAccount = await User.findByIdAndUpdate(
                kyc.user,
                { isKYCVerified: false },
                { new: true }
            );
        }

        // 3. Handle Notifications
        if (targetAccount) {
            if (targetAccount.notificationId) {
                await sendKycNotification(
                    targetAccount.notificationId,
                    'rejected',
                    kyc.rejectionReason
                );
            }

            await saveNotification({
                userId: targetAccount._id,
                title: 'KYC Rejected',
                message: kyc.rejectionReason,
                type: 'kyc'
            });

            const recipientEmail = targetAccount.email || targetAccount.emailAddress; 

            if (recipientEmail) {
                const title = 'Update on your KYC Verification';
                const bodyHtml = `
                <p>Hello ${targetAccount.firstName || targetAccount.fullName || ''},</p>
                <p>Thank you for submitting your KYC details on Taskhub. Unfortunately, your verification could not be completed at this time due to the following reason(s):</p>
                
                <div class="highlight-box" style="border-left-color: #ff4d4d; background-color: #fff5f5; padding: 15px; border-left: 4px solid #ff4d4d; border-radius: 4px; margin: 20px 0;">
                    <p style="color: #cc0000; font-size: 16px; font-weight: bold; margin: 0 0 5px 0;">Reason for Rejection:</p>
                    <p style="font-size: 15px; color: #333; font-weight: 500; margin: 0;">${kyc.rejectionReason}</p>
                </div>
                
                <p>Kindly review your submission and re-upload the required or corrected documents to proceed with your verification.</p>
                <p>If you need assistance, please contact our support team.</p>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="${process.env.FRONTEND_URL || 'https://www.ngtaskhub.com'}/login" class="cta-button" style="background-color: #8600AF; color: white; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: 600; display: inline-block;">Submit New KYC</a>
                </div>
            `;

                await sendEmail({
                    to: recipientEmail,
                    subject: title,
                    html: baseLayout(title, bodyHtml) 
                });
            }
        }

        // 4. Log Admin Action
        await logAdminAction({
            adminId: req.admin._id,
            action: 'REJECT_KYC',
            resourceType: 'KYC',
            resourceId: kyc._id,
            req
        });

        res.json({
            status: 'success',
            message: 'KYC rejected successfully',
            data: kyc
        });

    } catch (error) {
        console.error('Reject KYC error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to reject KYC' });
    }
};

// GET /api/admin/kyc/:id
export const getKycDetails = async (req, res) => {
    try {
        const kycId = req.params.id;

        // Fetch the KYC record and populate based on userType
        const kyc = await KYCVerification.findById(kycId)
            .populate('user') 
            .populate('reviewedBy', 'firstName lastName'); 

        if (!kyc) {
            return res.status(404).json({ status: 'error', message: 'KYC record not found' });
        }

        const responseData = {
            status: kyc.status, 
            submittedAt: kyc.createdAt,

            userInformation: {
                fullName: kyc.userType === 'Tasker'
                    ? `${kyc.user.firstName} ${kyc.user.lastName}`
                    : kyc.user.fullName,
                email: kyc.user.emailAddress,
                phone: kyc.user.phoneNumber || 'N/A',
                location: kyc.user.residentState || 'N/A',
                accountType: kyc.userType, 
                bio: kyc.userType === 'Tasker' ? kyc.user.bio : 'N/A',
                profilePicture: kyc.user.profilePicture
            },

            kycInfo: {
                nin: kyc.nin || null, 
                maskedNin: kyc.maskedNin, 
                ninResubmissionRequired: kyc.ninResubmissionRequired || false,
                userId: kyc.user._id,
                submissionDate: kyc.createdAt,
                lastUpdated: kyc.updatedAt,
                matchStatus: kyc.verificationSummary?.matchStatus || 'Pending Review',
                mismatches: kyc.verificationSummary?.mismatches || []
            },

            documents: {
                idFront: kyc.idFrontUrl || null,
                idBack: kyc.idBackUrl || null,
                selfie: kyc.selfieUrl || null
            }
        };

        res.json({
            status: 'success',
            data: responseData
        });

    } catch (error) {
        console.error('Get KYC details error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch KYC details' });
    }
};