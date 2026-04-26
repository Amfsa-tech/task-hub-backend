import { Resend } from 'resend';
import * as Sentry from '@sentry/node';
import { 
    newTaskEmailHtml, 
    bidAcceptedEmailHtml, 
    bidRejectedEmailHtml, 
    taskCancelledEmailHtml,
} from '../utils/taskerEmailTemplates.js'; // Adjust path if needed

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Base function to send emails via Resend
 */
export const sendEmail = async ({ to, subject, html }) => {
    try {
        const data = await resend.emails.send({
            from: 'TaskHub <notifications@ngtaskhub.com>', // Ensure this domain is verified in Resend
            to,
            subject,
            html,
        });
        return { success: true, data };
    } catch (error) {
        console.error('Email Send Error:', error);
        Sentry.captureException(error);
        return { success: false, error };
    }
};

/**
 * Specifically for Stellar/Bank Payouts
 */
export const payoutSuccessEmailHtml = ({ taskerName, amount, method, txHash }) => {
    const explorerLink = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    
    // Using your existing baseLayout style logic manually here or 
    // you can move baseLayout to a common util to reuse it.
    const body = `
        <p>Hi ${taskerName},</p>
        <p>Great news! Your withdrawal request has been processed successfully.</p>
        <div class="highlight-box" style="background-color: #f9f2fc; border-left: 4px solid #8600AF; padding: 16px;">
            <p style="color: #8600AF; font-weight: bold; margin: 0;">Amount: &#8358;${amount}</p>
            <p style="font-size: 14px; margin: 5px 0;">Method: ${method === 'stellar_crypto' ? 'Stellar (XLM)' : 'Bank Transfer'}</p>
            ${txHash ? `<p style="font-size: 12px;">Hash: <a href="${explorerLink}">${txHash.substring(0, 15)}...</a></p>` : ''}
        </div>
        <p>Your funds should reflect in your wallet shortly.</p>
    `;

    // Assuming you export baseLayout from your template file
    // For now, I'll return a formatted string. 
    return body; 
};