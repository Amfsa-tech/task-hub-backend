import User from '../models/user.js';
import Task from '../models/task.js';
import Tasker from '../models/tasker.js';
import KYCVerification from '../models/kycVerification.js';
import AuditLog from '../models/adminAuditLog.js'; // Ensure filename matches exactly
import * as Sentry from '@sentry/node';

export const getDashboardStats = async (req, res) => {
  try {
    // 1. RAW COUNTS & CARD METRICS
    const [
      totalUsers, 
      totalTaskers, 
      totalTasks, 
      pendingKyc,
      activeTasksCount // Card 4: Sum of assigned + in-progress
    ] = await Promise.all([
      User.countDocuments(),
      Tasker.countDocuments(),
      Task.countDocuments(),
      KYCVerification.countDocuments({ status: 'pending' }),
      Task.countDocuments({ status: { $in: ['assigned', 'in-progress'] } })
    ]);

    // 2. TASK STATUS BREAKDOWN (For Charts/Calculations)
    const tasksByStatusAgg = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const taskStatus = { open: 0, assigned: 0, 'in-progress': 0, completed: 0, cancelled: 0 };
    tasksByStatusAgg.forEach(item => { taskStatus[item._id] = item.count; });

    // 3. FINANCIALS (Matches the Revenue Card)
    const revenueAgg = await Task.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$budget' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // --- RESTORED SECTION: QUICK STATS WIDGET ---
    // These match the bottom-right "Quick Stats" card in your design
    
    // Ratio: e.g. "0.2" (1 Tasker for every 5 Users)
    const userToTaskerRatio = totalTaskers > 0 ? (totalUsers / totalTaskers).toFixed(2) : 0;
    
    // Completion Rate: e.g. "89.5" (%)
    const completionRate = totalTasks > 0 ? ((taskStatus.completed / totalTasks) * 100).toFixed(1) : 0;
    
    // Avg Task Value: e.g. "20000" (Revenue / Completed Tasks)
    const avgTaskValue = taskStatus.completed > 0 ? (totalRevenue / taskStatus.completed).toFixed(0) : 0;

    // ----------------------------------------------

    // 4. RECENT TASKS TABLE
    // Populating 'emailAddress' so the UI can show "aisha.musa@taskhubdemo.com"
    const recentTasksList = await Task.find()
        .populate('user', 'fullName emailAddress profilePicture') 
        .sort({ createdAt: -1 })
        .limit(5);

    // 5. UNIFIED ACTIVITY FEED (Matches the Timeline)
    const [recentTasks, recentKyc, recentAudit] = await Promise.all([
        Task.find().populate('user', 'fullName').sort({ createdAt: -1 }).limit(3),
        KYCVerification.find().populate('user', 'fullName').sort({ createdAt: -1 }).limit(3),
        AuditLog.find().populate('admin', 'firstName lastName').sort({ createdAt: -1 }).limit(3)
    ]);

    // Merge and sort for the UI Timeline
    const unifiedActivity = [
        ...recentTasks.map(t => ({ type: 'task', title: 'New Task Posted', detail: t.title, date: t.createdAt })),
        ...recentKyc.map(k => ({ type: 'kyc', title: 'KYC Submitted', detail: k.user?.fullName, date: k.createdAt })),
        ...recentAudit.map(a => ({ type: 'admin', title: a.action, detail: `By Admin ${a.admin?.firstName}`, date: a.createdAt }))
    ].sort((a, b) => b.date - a.date).slice(0, 8);

    res.json({
      status: 'success',
      data: {
        // TOP 8 CARDS
        cards: {
            totalUsers,      
            totalTaskers,    
            totalTasks,      
            activeTasks: activeTasksCount, 
            completedTasks: taskStatus.completed, 
            cancelledTasks: taskStatus.cancelled, 
            pendingKyc,      
            totalRevenue     
        },

        // BOTTOM RIGHT WIDGET (RESTORED)
        quickStats: {
            userToTaskerRatio,
            completionRate,
            avgTaskValue
        },

        // PERCENTAGE GROWTH (Static for now, per design)
        growth: 24, 

        // RECENT TASKS TABLE
        recentTasks: recentTasksList,

        // RECENT ACTIVITY TIMELINE
        recentActivity: unifiedActivity
      }
    });

  } catch (error) {
    Sentry.captureException(error);
    console.error('Dashboard error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch dashboard stats' });
  }
};