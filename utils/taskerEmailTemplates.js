/**
 * Email templates for tasker notifications.
 * Matches the existing TaskHub email style (brand purple #8600AF, dark footer).
 */

const LOGO_URL = 'https://res.cloudinary.com/daf6mdwkh/image/upload/v1750868774/20250614_185641_iwuj1n.png';

export const baseLayout = (title, bodyHtml) => `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
            color: #333;
            line-height: 1.6;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }
        .header {
            background-color: white;
            padding: 30px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 10px 0 0;
            font-size: 24px;
            font-weight: 600;
            color: #8600AF;
        }
        .content {
            padding: 30px;
            color: #333;
        }
        .highlight-box {
            background-color: #f9f2fc;
            border-left: 4px solid #8600AF;
            border-radius: 8px;
            padding: 16px 20px;
            margin: 20px 0;
        }
        .highlight-box .task-title {
            font-size: 18px;
            font-weight: 700;
            color: #8600AF;
            margin: 0 0 8px;
        }
        .highlight-box .detail {
            margin: 4px 0;
            font-size: 14px;
            color: #555;
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
        }
        .footer {
            background-color: #121212;
            color: #aaa;
            padding: 25px;
            text-align: center;
            font-size: 14px;
        }
        @media screen and (max-width: 600px) {
            .email-container { border-radius: 0; }
            .content { padding: 20px; }
        }
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
            <p>Best regards,<br>The TaskHub Team</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} TaskHub. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;

// --- New task in category ---
export const newTaskEmailHtml = ({ taskerName, taskTitle, categoryNames, budget }) => {
    return baseLayout('New Task Available', `
        <p>Hi ${taskerName},</p>
        <p>A new task matching your skills has just been posted on TaskHub!</p>
        <div class="highlight-box">
            <p class="task-title">${taskTitle}</p>
            <p class="detail"><strong>Category:</strong> ${categoryNames}</p>
            <p class="detail"><strong>Budget:</strong> &#8358;${budget}</p>
        </div>
        <p>Open the TaskHub app to view the full details and place your bid before someone else does.</p>
    `);
};

// --- Bid accepted ---
export const bidAcceptedEmailHtml = ({ taskerName, taskTitle, bidAmount }) => {
    return baseLayout('Your Bid Was Accepted!', `
        <p>Hi ${taskerName},</p>
        <p>Great news! Your bid has been accepted.</p>
        <div class="highlight-box">
            <p class="task-title">${taskTitle}</p>
            <p class="detail"><strong>Your Bid:</strong> &#8358;${bidAmount}</p>
        </div>
        <p>Open the TaskHub app to view the task details and get started.</p>
    `);
};

// --- Bid rejected ---
export const bidRejectedEmailHtml = ({ taskerName, taskTitle, bidAmount }) => {
    return baseLayout('Bid Update', `
        <p>Hi ${taskerName},</p>
        <p>Unfortunately, your bid was not selected this time.</p>
        <div class="highlight-box">
            <p class="task-title">${taskTitle}</p>
            <p class="detail"><strong>Your Bid:</strong> &#8358;${bidAmount}</p>
        </div>
        <p>Don't worry — new tasks are posted every day. Keep browsing and bidding!</p>
    `);
};

// --- Task cancelled ---
export const taskCancelledEmailHtml = ({ taskerName, taskTitle }) => {
    return baseLayout('Task Cancelled', `
        <p>Hi ${taskerName},</p>
        <p>The following task has been cancelled by the poster:</p>
        <div class="highlight-box">
            <p class="task-title">${taskTitle}</p>
        </div>
        <p>If you had an active bid or assignment on this task, it has been released. Check the app for other available tasks.</p>
    `);
};
