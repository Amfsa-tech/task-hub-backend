import * as Sentry from '@sentry/node';
import { sendEmail } from '../utils/authUtils.js';
import { buildSupportEmail, validateSupportRequest } from '../utils/supportRequestUtils.js';

export const submitSupportRequest = async (req, res) => {
  try {
    const validation = validateSupportRequest(req.body);
    if (!validation.ok) {
      return res.status(validation.statusCode).json({
        status: 'error',
        message: validation.message,
      });
    }

    await sendEmail(buildSupportEmail(validation.value));

    return res.status(200).json({
      status: 'success',
      message: 'Support request sent successfully',
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('submitSupportRequest error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to send support request',
    });
  }
};

export default {
  submitSupportRequest,
};
