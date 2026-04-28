import Waitlist from '../models/waitlist.js';
import { sendEmail } from '../utils/authUtils.js';
import * as Sentry from '@sentry/node';

// POST /api/waitlist — public
export const joinWaitlist = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || typeof email !== 'string') {
            return res.status(400).json({ status: 'error', message: 'Email is required' });
        }

        const trimmedEmail = email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
            return res.status(400).json({ status: 'error', message: 'Invalid email format' });
        }

        const existing = await Waitlist.findOne({ email: trimmedEmail });
        if (existing) {
            return res.status(409).json({ status: 'error', message: 'Email already on waitlist' });
        }

        const entry = await Waitlist.create({ email: trimmedEmail });

        // Send confirmation email (non-blocking — don't fail the request if mail fails)
        try {
            await sendEmail({
                to: trimmedEmail,
                subject: "You're on the TaskHub Waitlist!",
                html: `
                    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                        <div style="background:#4F46E5;padding:30px 20px;text-align:center;color:#ffffff;">
                            <h1 style="margin:0;font-size:28px;font-weight:700;">TaskHub</h1>
                        </div>
                        <div style="padding:30px 24px;">
                            <h2 style="color:#333;font-size:22px;margin-top:0;">You're on the list!</h2>
                            <p style="color:#555;font-size:16px;line-height:1.6;">
                                Thanks for joining the TaskHub waitlist. We'll notify you as soon as we're ready to welcome you aboard.
                            </p>
                            <p style="color:#555;font-size:16px;line-height:1.6;">
                                Stay tuned — exciting things are coming your way.
                            </p>
                        </div>
                        <div style="background:#f9fafb;padding:20px 24px;text-align:center;color:#999;font-size:13px;">
                            &copy; ${new Date().getFullYear()} TaskHub. All rights reserved.
                        </div>
                    </div>
                `
            });
        } catch (mailErr) {
            Sentry.captureException(mailErr);
            console.error('Waitlist confirmation email failed:', mailErr.message);
        }

        return res.status(201).json({
            status: 'success',
            message: 'Successfully joined the waitlist',
            data: { email: entry.email, createdAt: entry.createdAt }
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('joinWaitlist error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error', error: error.message });
    }
};

// GET /api/waitlist — admin-protected
export const getWaitlistEmails = async (req, res) => {
    try {
        const entries = await Waitlist.find().sort({ createdAt: -1 });
        return res.status(200).json({
            status: 'success',
            count: entries.length,
            data: entries
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('getWaitlistEmails error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error', error: error.message });
    }
};
