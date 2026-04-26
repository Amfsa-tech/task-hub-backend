import KYCVerification from '../models/kycVerification.js';
import DiditSession from '../models/diditSession.js';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import * as Sentry from '@sentry/node';

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

    // --- Resolve userId: try vendor_data first, then fall back to session lookup ---
    const sessionId = webhookData?.session_id || decision?.session_id;
    let userId = decision.vendor_data;
    let userType = null;
    let userRecord = null;

    if (!userId && sessionId) {
      console.log(`[Didit Webhook] vendor_data is null — looking up session ${sessionId}`);
      const sessionMapping = await DiditSession.findOne({ sessionId });
      if (sessionMapping) {
        userId = sessionMapping.userId.toString();
        userType = sessionMapping.userType;
        console.log(`[Didit Webhook] Found session mapping: userId=${userId}, userType=${userType}`);
      }
    }

    if (!userId) {
      console.error('[Didit Webhook] Cannot resolve userId — vendor_data is null and no session mapping found');
      return res.status(400).json({
        success: false,
        message: 'Cannot resolve userId from webhook payload',
      });
    }

    const decisionStatus = decision.status || topStatus;

    // --- Normalise status ---
    let normalizedStatus;
    if (/^approved$/i.test(decisionStatus)) {
      normalizedStatus = 'approved';
    } else {
      normalizedStatus = 'rejected';
    }

    // --- Extract & mask NIN ---
    const rawNin = extractNinFromDecision(decision);
    const maskedNin = rawNin ? maskNin(rawNin) : null;

    console.log(`[Didit Webhook] Processing: userId=${userId}, status=${normalizedStatus}, nin=${maskedNin || 'N/A'}`);

    // --- Determine user type (use session mapping if available, otherwise check both) ---
    if (!userRecord) {
      if (userType === 'Tasker') {
        userRecord = await Tasker.findById(userId);
      } else if (userType === 'User') {
        userRecord = await User.findById(userId);
      } else {
        // No hint from session mapping — check both collections
        userRecord = await Tasker.findById(userId);
        if (userRecord) {
          userType = 'Tasker';
        } else {
          userRecord = await User.findById(userId);
          if (userRecord) {
            userType = 'User';
          }
        }
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
          normalizedStatus === 'rejected'
            ? warnings.map(w => w.short_description || w.risk || 'Unknown')
            : [],
        verifiedAt: normalizedStatus === 'approved' ? new Date() : undefined,
      },
      { upsert: true, new: true }
    );

    // --- If approved, flip verification flags on the user record ---
    if (normalizedStatus === 'approved') {
      const updateFields = { verifyIdentity: true, isKYCVerified: true };
      if (userType === 'Tasker') {
        await Tasker.findByIdAndUpdate(userId, { $set: updateFields });
      } else {
        await User.findByIdAndUpdate(userId, { $set: updateFields });
      }

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
    Sentry.captureException(error);
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
        isVerified: kycRecord.status === 'approved',
        maskedNin: kycRecord.maskedNin,
        verifiedAt: kycRecord.verifiedAt,
        rejectionReasons: kycRecord.rejectionReasons,
        updatedAt: kycRecord.updatedAt,
      },
    });
  } catch (error) {
    console.error('[KYC] Error fetching verification status:', error);
    Sentry.captureException(error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch verification status',
    });
  }
};

/**
 * POST /api/v1/kyc/register-session
 *
 * Called by the frontend after creating a Didit verification session.
 * Stores the session_id → userId mapping so the webhook can resolve the user
 * (Didit v3 does not pass vendor_data back in the webhook).
 *
 * Body: { sessionId: string }
 * Auth: JWT required (userId comes from the token)
 */
export const registerSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user._id || req.user.id;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId is required',
      });
    }

    // Determine user type
    let userType = null;
    const tasker = await Tasker.findById(userId);
    if (tasker) {
      userType = 'Tasker';
    } else {
      const user = await User.findById(userId);
      if (user) {
        userType = 'User';
      }
    }

    if (!userType) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    await DiditSession.findOneAndUpdate(
      { sessionId },
      { sessionId, userId, userType },
      { upsert: true, new: true }
    );

    console.log(`[KYC] Registered Didit session ${sessionId} for ${userType} ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Session registered',
    });
  } catch (error) {
    console.error('[KYC] Error registering session:', error);
    Sentry.captureException(error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register session',
    });
  }
};
