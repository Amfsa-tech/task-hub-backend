import { Resend } from 'resend';
import * as Sentry from '@sentry/node';
import { 
    newTaskEmailHtml, 
    bidAcceptedEmailHtml, 
    bidRejectedEmailHtml, 
    taskCancelledEmailHtml,
} from '../utils/taskerEmailTemplates.js'; // Adjust path if needed

const resend = new Resend(process.env.RESEND_API_KEY);
const LOGO_URL = 'https://res.cloudinary.com/daf6mdwkh/image/upload/v1750868774/20250614_185641_iwuj1n.png';

// --- BASE LAYOUT ---
export const baseLayout = (title, bodyHtml) => `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; color: #333; line-height: 1.6; }
        .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); }
        .header { background-color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 10px 0 0; font-size: 24px; font-weight: 600; color: #8600AF; }
        .content { padding: 30px; color: #333; }
        .highlight-box { background-color: #f9f2fc; border-left: 4px solid #8600AF; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
        .highlight-box .task-title { font-size: 18px; font-weight: 700; color: #8600AF; margin: 0 0 8px; }
        .highlight-box .detail { margin: 4px 0; font-size: 14px; color: #555; }
        .cta-button { display: inline-block; background-color: #8600AF; color: white; text-decoration: none; padding: 14px 28px; border-radius: 50px; font-weight: 600; margin: 20px 0; }
        .footer { background-color: #121212; color: #aaa; padding: 25px; text-align: center; font-size: 14px; }
        @media screen and (max-width: 600px) { .email-container { border-radius: 0; } .content { padding: 20px; } }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <img src="${LOGO_URL}" alt="TaskHub" style="width: 80px; height: 80px;">
            <h1>${title}</h1>
        </div>
        <div class="content">
            ${bodyHtml}
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} TaskHub. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;

// --- SEND EMAIL FUNCTION ---
export const sendEmail = async ({ to, subject, html }) => {
    try {
        const data = await resend.emails.send({
            from: 'TaskHub <notifications@ngtaskhub.com>', 
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

// --- EXISTING TEMPLATES ---
export const payoutSuccessEmailHtml = ({ taskerName, amount, method, txHash }) => {
    const explorerLink = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    
    const body = `
        <p>Hi ${taskerName},</p>
        <p>Great news! Your withdrawal request has been processed successfully.</p>
        <div class="highlight-box">
            <p style="color: #8600AF; font-weight: bold; margin: 0;">Amount: &#8358;${amount}</p>
            <p style="font-size: 14px; margin: 5px 0;">Method: ${method === 'stellar_crypto' ? 'Stellar (XLM)' : 'Bank Transfer'}</p>
            ${txHash ? `<p style="font-size: 12px;">Hash: <a href="${explorerLink}">${txHash.substring(0, 15)}...</a></p>` : ''}
        </div>
        <p>Your funds should reflect in your wallet shortly.</p>
    `;

    return baseLayout('Payout Successful', body); 
};

// --- NEW TEMPLATES ---
export const taskCancelledUserEmailHtml = ({ userName, taskTitle, reason }) => {
    const body = `
        <p>Hello ${userName},</p>
        <p>We are writing to inform you that your recently posted task, <strong>${taskTitle}</strong>, has been cancelled by our Compliance team.</p>
        <div class="highlight-box">
            <p class="task-title">Reason for Cancellation:</p>
            <p class="detail">${reason || 'Violation of community guidelines'}</p>
        </div>
        <p>Please ensure that all future posts follow our community guidelines. If you believe this was a mistake, or if you need help re-posting your task correctly, please message our support team at <a href="mailto:support@ngtaskhub.com" style="color: #8600AF;">support@ngtaskhub.com</a>.</p>
    `;
    return baseLayout('Task Cancelled', body);
};

export const taskCancelledTaskerEmailHtml = ({ taskerName, taskTitle }) => {
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.ngtaskhub.com';
    const body = `
        <p>Hello ${taskerName},</p>
        <p>We are contacting you regarding your application for the task: <strong>${taskTitle}</strong>.</p>
        <p>This task has been cancelled by the TaskHub administration team and is no longer available for bidding. As a result, your application has been closed.</p>
        <p>Don't worry, there are plenty of other opportunities waiting for you! Head over to the dashboard to find more tasks that match your skills.</p>
        <div style="text-align: center;">
            <a href="${frontendUrl}/tasks" class="cta-button">Browse Available Tasks</a>
        </div>
    `;
    return baseLayout('Update on your application', body);
};

export const customAdminEmailHtml = ({ name, message }) => {
    const formattedMessage = message.split('\n').map(line => `<p>${line}</p>`).join('');
    const body = `
        <p>Hi ${name},</p>
        ${formattedMessage}
    `;
    return baseLayout('Important Update from TaskHub Admin', body);
};