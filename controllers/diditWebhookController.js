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
 * Extracts the NIN (document_number) from the Didit decision payload.
 *
 * Actual Didit structure:
 *   decision.id_verifications[0].document_number → "34577667839"
 */
const extractNinFromDecision = (decision) => {
  const idVerification = decision?.id_verifications?.[0];
  return idVerification?.document_number || null;
};

/**
 * POST /api/v1/kyc/didit-webhook
 *
 * Webhook handler for Didit identity verification callbacks.
 * Didit sends multiple webhook POSTs per session as status changes:
 *   "Not Started" → "In Progress" → "Approved" / "Declined"
 *
 * Only the final webhook (with a `decision` object) carries the full data.
 * Intermediate status updates are acknowledged but ignored.
 *
 * Actual Didit payload structure:
 *   {
 *     session_id, status, webhook_type, workflow_id,
 *     decision: {
 *       vendor_data,          ← userId (set when session was created)
 *       status,               ← "Approved" | "Declined"
 *       id_verifications: [{ document_number, first_name, ... }]
 *     }
 *   }
 */
export const handleDiditWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    const topStatus = webhookData?.status;
    const decision = webhookData?.decision;

    console.log('[Didit Webhook] Received:', JSON.stringify({
      session_id: webhookData?.session_id,
      status: topStatus,
      webhook_type: webhookData?.webhook_type,
      has_decision: !!decision,
      vendor_data: decision?.vendor_data ?? null,
    }));

    // --- Ignore intermediate status webhooks (Not Started, In Progress) ---
    if (!decision) {
      console.log(`[Didit Webhook] Intermediate status "${topStatus}" — no decision yet, acknowledging`);
      return res.status(200).json({
        success: true,
        message: `Intermediate status "${topStatus}" acknowledged`,
      });
    }

    // --- Extract fields from the decision object ---
    const userId = decision.vendor_data;
    const sessionId = webhookData?.session_id || decision?.session_id;
    const decisionStatus = decision.status || topStatus;

    if (!userId) {
      console.error('[Didit Webhook] vendor_data is null in decision — cannot match to a user. Make sure vendor_data is set when creating the Didit session.');
      return res.status(400).json({
        success: false,
        message: 'Missing vendor_data (userId) in webhook decision payload',
      });
    }

    // --- Normalise status ---
    let normalizedStatus;
    if (/^approved$/i.test(decisionStatus)) {
      normalizedStatus = 'Approved';
    } else {
      normalizedStatus = 'Rejected';
    }

    // --- Extract & mask NIN ---
    const rawNin = extractNinFromDecision(decision);
    const maskedNin = rawNin ? maskNin(rawNin) : null;

    console.log(`[Didit Webhook] Processing: userId=${userId}, status=${normalizedStatus}, nin=${maskedNin || 'N/A'}`);

    // --- Determine user type (Tasker first, then User) ---
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

    // --- Build non-PII verification metadata ---
    const idVerification = decision.id_verifications?.[0];
    const warnings = idVerification?.warnings || [];

    // --- Upsert KYC record (only masked NIN is stored) ---
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
          statusRaw: decisionStatus,
          processedAt: new Date().toISOString(),
          hasDocumentData: !!rawNin,
          documentType: idVerification?.document_type || null,
          issuingState: idVerification?.issuing_state_name || null,
          warningCount: warnings.length,
        },
        rejectionReasons:
          normalizedStatus === 'Rejected'
            ? warnings.map(w => w.short_description || w.risk || 'Unknown')
            : [],
        verifiedAt: normalizedStatus === 'Approved' ? new Date() : undefined,
      },
      { upsert: true, new: true }
    );

    // --- If approved, flip verification flags on the user record ---
    if (normalizedStatus === 'Approved') {
      userRecord.verifyIdentity = true;
      userRecord.isKYCVerified = true;
      await userRecord.save();

      console.log(`[Didit Webhook] ✓ ${userType} ${userId} identity verified successfully`);
    } else {
      console.log(`[Didit Webhook] ✗ ${userType} ${userId} identity verification rejected`);
    }

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
