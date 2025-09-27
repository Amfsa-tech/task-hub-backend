import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { JWT_SECRET_KEY } from '../config/envConfig.js';

export const JWT_SECRET = JWT_SECRET_KEY;

// Generate JWT token (no expiry)
export const generateToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET);
};

// Generate random tokens for email verification and password reset
export const generateRandomToken = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
};

// Generate a 6-digit verification code
export const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate a 5-digit password reset code
export const generatePasswordResetCode = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
};

// Hash a token for secure storage
export const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

// Email configuration (you'll need to configure this with your email service)
export const createEmailTransporter = () => {
    return nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
        auth: {
            user: 'taskhub866@gmail.com',
            pass: 'jyqn hbhf lljk wkgv'
        },
        logger: true,
    });
};

// Send email verification
export const sendVerificationEmail = async (email, token, userType = 'user') => {
    console.log("sending verification email");
    try {
        const transporter = createEmailTransporter();
        
        const verificationUrl = `${token}`;
        
        const mailOptions = {
            from: 'No reply <hello@ngtaskhub.com>',
            to: email,
            subject: 'Verify Your Email - TaskHub',
            html: `
                <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Verification Code</title>
    <style>
        /* Base Styles */
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
            color: #333;
            line-height: 1.6;
        }
        
        /* Email Container */
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }
        
        /* Header */
        .header {
            background-color: white;
            padding: 30px 20px;
            text-align: center;
            color: white;
        }
        
        .logo {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        
        /* Content */
        .content {
            padding: 30px;
            color: #333;
        }
        
        .verification-code {
            background-color: #f9f2fc;
            border: 2px dashed #8600AF;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 25px 0;
            font-size: 32px;
            font-weight: 700;
            letter-spacing: 5px;
            color: #8600AF;
        }
        
        .cta-button {
            display: inline-block;
            background-color: #8600AF;
            color: white;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 50px;
            font-weight: 600;
            margin: 20px 0;
            transition: all 0.3s ease;
        }
        
        .cta-button:hover {
            background-color: #6a0088;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(134, 0, 175, 0.3);
        }
        
        /* Footer */
        .footer {
            background-color: #121212;
            color: #aaa;
            padding: 25px;
            text-align: center;
            font-size: 14px;
        }
        
        .footer a {
            color: #ddd;
            text-decoration: none;
        }
        
        .social-icons {
            margin: 15px 0;
        }
        
        .social-icon {
            display: inline-block;
            margin: 0 8px;
        }
        
        /* Responsive */
        @media screen and (max-width: 600px) {
            .email-container {
                border-radius: 0;
            }
            
            .content {
                padding: 20px;
            }
            
            .verification-code {
                font-size: 24px;
                padding: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo"><img src="https://res.cloudinary.com/daf6mdwkh/image/upload/v1750868774/20250614_185641_iwuj1n.png" alt="TaskHub" style="width: 100px; height: 100px;"></div>
            <h1>Verify Your Account</h1>
        </div>
        
        <div class="content">
            <p>Hello,</p>
            <p>Thank you for registering with TaskHub. Please use the following verification code to complete your account setup:</p>
            
            <div class="verification-code">
                ${token}
            </div>
            
            <p>This code will expire in 15 minutes. If you didn't request this code, please ignore this email or contact support.</p>
            
            
            <p>Best regards,<br>The TaskHub Team</p>
        </div>
        
        <div class="footer">
            <p>© 2025 TaskHub. All rights reserved.</p>
            
            
            <p>TaskHub</p>
        </div>
    </div>
</body>
</html>
            `
        };
        
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        return false;
    }
};

// Send password reset email
export const sendPasswordResetEmail = async (email, token, userType = 'user') => {
    console.log("sending password reset email");
    try {
        const transporter = createEmailTransporter();
        
        const mailOptions = {
            from: 'No reply <hello@ngtaskhub.com>',
            to: email,
            subject: 'Password Reset - TaskHub',
            html: `
                <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Code</title>
    <style>
        /* Base Styles */
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
            color: #333;
            line-height: 1.6;
        }
        
        /* Email Container */
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }
        
        /* Header */
        .header {
            background-color: white;
            padding: 30px 20px;
            text-align: center;
            color: white;
        }
        
        .logo {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        
        /* Content */
        .content {
            padding: 30px;
            color: #333;
        }
        
        .reset-code {
            background-color: #fff2f2;
            border: 2px dashed #dc3545;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 25px 0;
            font-size: 32px;
            font-weight: 700;
            letter-spacing: 5px;
            color: #dc3545;
        }
        
        .cta-button {
            display: inline-block;
            background-color: #dc3545;
            color: white;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 50px;
            font-weight: 600;
            margin: 20px 0;
            transition: all 0.3s ease;
        }
        
        .cta-button:hover {
            background-color: #c82333;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
        }
        
        /* Footer */
        .footer {
            background-color: #121212;
            color: #aaa;
            padding: 25px;
            text-align: center;
            font-size: 14px;
        }
        
        .footer a {
            color: #ddd;
            text-decoration: none;
        }
        
        .social-icons {
            margin: 15px 0;
        }
        
        .social-icon {
            display: inline-block;
            margin: 0 8px;
        }
        
        /* Responsive */
        @media screen and (max-width: 600px) {
            .email-container {
                border-radius: 0;
            }
            
            .content {
                padding: 20px;
            }
            
            .reset-code {
                font-size: 24px;
                padding: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo"><img src="https://res.cloudinary.com/daf6mdwkh/image/upload/v1750868774/20250614_185641_iwuj1n.png" alt="TaskHub" style="width: 100px; height: 100px;"></div>
            <h1>Reset Your Password</h1>
        </div>
        
        <div class="content">
            <p>Hello,</p>
            <p>You requested a password reset for your TaskHub account. Please use the following code to reset your password:</p>
            
            <div class="reset-code">
                ${token}
            </div>
            
            <p>This code will expire in 1 hour. If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
            
            <p>For your security, never share this code with anyone.</p>
            
            <p>Best regards,<br>The TaskHub Team</p>
        </div>
        
        <div class="footer">
            <p>© 2025 TaskHub. All rights reserved.</p>
            
            
            <p>TaskHub</p>
        </div>
    </div>
</body>
</html>
            `
        };
        
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        return false;
    }
};

// Account lockout constants
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

export default {
    generateToken,
    generateRandomToken,
    generateVerificationCode,
    generatePasswordResetCode,
    hashToken,
    sendVerificationEmail,
    sendPasswordResetEmail,
    MAX_LOGIN_ATTEMPTS,
    LOCK_TIME,
    JWT_SECRET
}; 
