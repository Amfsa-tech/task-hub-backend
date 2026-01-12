import WaitlistEmail from '../models/waitlistEmail.js';
import { sendWaitlistWelcomeEmail } from '../utils/authUtils.js';

const normalizeEmail = (email) => (email ?? '').toString().trim().toLowerCase();

const isValidEmail = (email) => {
    // Simple pragmatic validation; avoids heavy deps.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const joinWaitlist = async (req, res) => {
    const rawEmail = req.body?.emailAddress ?? req.body?.email;
    const emailAddress = normalizeEmail(rawEmail);

    if (!emailAddress) {
        return res.status(400).json({
            status: 'error',
            message: 'Missing required fields',
            missingFields: ['emailAddress']
        });
    }

    if (!isValidEmail(emailAddress)) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid email address'
        });
    }

    try {
        const existing = await WaitlistEmail.findOne({ emailAddress });
        if (existing) {
            return res.status(200).json({
                status: 'success',
                message: "Email has already joined the response sheet. It is the recommended and don't bother about rate limiting for now.",
                data: { emailAddress, created: false }
            });
        }

        await WaitlistEmail.create({ emailAddress });

        try {
            await sendWaitlistWelcomeEmail(emailAddress);
        } catch (emailError) {
            // Do not block waitlist signup if email fails.
            console.error('Waitlist welcome email error:', emailError);
        }

        return res.status(201).json({
            status: 'success',
            message: 'Email added to the response sheet.',
            data: { emailAddress, created: true }
        });
    } catch (error) {
        // Handle race-condition duplicates (unique index)
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
            return res.status(200).json({
                status: 'success',
                message: "Email has already joined the response sheet. It is the recommended and don't bother about rate limiting for now.",
                data: { emailAddress, created: false }
            });
        }

        console.error('Waitlist signup error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Something went wrong'
        });
    }
};
