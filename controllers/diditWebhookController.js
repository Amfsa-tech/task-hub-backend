import KYCVerification from '../models/kycVerification.js';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';

/**
 * Masks a NIN string, showing only the last 4 characters.
 * e.g., "12345678901" -> "*******8901"
 */
const maskNin = (nin) => {
  if (!nin || nin.length < 4) return '*'.repeat(nin?.length || 0);
  const visiblePart = nin.slice(-4);
  const maskedPart = '*'.repeat(nin.length - 4);
  return maskedPart + visiblePart;
};

/**
 * Extracts the NIN from the Didit verification response.
 * Didit returns identity data from the ID document scan.
 */
const extractNinFromVerification = (webhookData) => {
  const documentData =
    webhookData?.document_data ||
    webhookData?.ocr_data ||
    webhookData?.identity_data ||
    {};

  return (
    documentData.document_number ||
    documentData.national_id ||
    documentData.nin ||
    documentData.id_number ||
    null
  );
};

/**
 * POST /api/v1/kyc/didit-webhook
 *
 * Webhook handler for Didit identity verification callbacks.
 * Didit sends this POST after an identity check is analyzed.
 *
 * Flow:
 *  1. Extract userId from vendor_data
 *  2. Normalise status (Approved / Rejected)
 *  3. Extract & mask NIN (raw NIN is NEVER persisted)
 *  4. Upsert KYCVerification record
 *  5. If Approved → set verifyIdentity & isKYCVerified on user record
 */
export const handleDiditWebhook = async (req, res) => {
  try {
    const webhookData = req.body;

    console.log('[Didit Webhook] Received payload:', JSON.stringify(webhookData, null, 2));

    // --- 1. Extract userId from vendor_data ---
    const userId = webhookData?.vendor_data;
    const sessionId = webhookData?.session_id || webhookData?.id;
    const status = webhookData?.status;

    if (!userId) {
      console.error('[Didit Webhook] Missing vendor_data (userId) in webhook payload');
      return res.status(400).json({
        success: false,
        message: 'Missing vendor_data in webhook payload',
      });
    }

    // --- 2. Normalise status ---
    let normalizedStatus;
    if (/^approved$/i.test(status)) {
      normalizedStatus = 'Approved';
    } else {
      normalizedStatus = 'Rejected';
    }

    // --- 3. Extract & mask NIN ---
    const rawNin = extractNinFromVerification(webhookData);
    const maskedNin = rawNin ? maskNin(rawNin) : null;

    // --- 4. Determine user type ---
    let userRecord = null;
    let userType = null;

    userRecord = await Tasker.findById(userId);
    if (userRecord) {
      userType = 'Tasker';
    } else {
      userRecord = await User.findById(userId);
      if (userRecord) {
        userType = 'User';
      }
    }

    if (!userRecord) {
      console.error(`[Didit Webhook] No user found with ID: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // --- 5. Upsert KYC record (masked NIN only) ---
    await KYCVerification.findOneAndUpdate(
      { user: userId, provider: 'didit' },
      {
        user: userId,
        userType,
        maskedNin,
        provider: 'didit',
        status: normalizedStatus,
        diditSessionId: sessionId,
        verificationData: {
          sessionId,
          statusRaw: status,
          processedAt: new Date().toISOString(),
          hasDocumentData: !!rawNin,
        },
        rejectionReasons:
          normalizedStatus === 'Rejected'
            ? webhookData?.rejection_reasons || webhookData?.errors || ['Verification failed']
            : [],
        verifiedAt: normalizedStatus === 'Approved' ? new Date() : undefined,
      },
      { upsert: true, new: true }
    );

    // --- 6. If approved, flip verification flags ---
    if (normalizedStatus === 'Approved') {
      userRecord.verifyIdentity = true;
      userRecord.isKYCVerified = true;
      await userRecord.save();

      console.log(`[Didit Webhook] ${userType} ${userId} identity verified successfully`);
    } else {
      console.log(`[Didit Webhook] ${userType} ${userId} identity verification rejected`);
    }

    // Always respond 200 to acknowledge the webhook
    return res.status(200).json({
      success: true,
      message: `Webhook processed. Status: ${normalizedStatus}`,
    });
  } catch (error) {
    console.error('[Didit Webhook] Error processing webhook:', error);
    // Return 200 to prevent Didit from retrying on transient errors
    return res.status(200).json({
      success: true,
      message: 'Webhook received (processing error logged)',
    });
  }
};

/**
 * GET /api/v1/kyc/verification-status
 *
 * Returns the current KYC verification status for the authenticated user.
 */
export const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const kycRecord = await KYCVerification.findOne({
      user: userId,
      provider: 'didit',
    }).sort({ createdAt: -1 });

    if (!kycRecord) {
      return res.status(200).json({
        success: true,
        data: {
          status: 'Not Started',
          isVerified: false,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        status: kycRecord.status,
        isVerified: kycRecord.status === 'Approved',
        maskedNin: kycRecord.maskedNin,
        verifiedAt: kycRecord.verifiedAt,
        rejectionReasons: kycRecord.rejectionReasons,
        updatedAt: kycRecord.updatedAt,
      },
    });
  } catch (error) {
    console.error('[KYC] Error fetching verification status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch verification status',
    });
  }
};
