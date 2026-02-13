import User from '../models/user.js';
import Task from '../models/task.js';
import Report from '../models/report.js';
import Tasker from '../models/tasker.js';
import KYCVerification from '../models/kycVerification.js';
import AuditLog from '../models/adminAuditLog.js';

export const getDashboardStats = async (req, res) => {
  try {
    // 1. RAW COUNTS
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    
    const totalTaskers = await Tasker.countDocuments();
    
    // 2. TASK METRICS
    const totalTasks = await Task.countDocuments();
    const tasksByStatusAgg = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    const taskStatus = { open: 0, assigned: 0, 'in-progress': 0, completed: 0, cancelled: 0 };
    tasksByStatusAgg.forEach(item => { taskStatus[item._id] = item.count; });

    // 3. FINANCIALS
    const revenueAgg = await Task.aggregate([
      { $match: { status: 'completed' } }, // Revenue comes from completed tasks
      { $group: { _id: null, total: { $sum: '$budget' } } } // Summing budget as proxy for value
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // 4. RECENT ACTIVITY (Feeds the Timeline)
    // We fetch these separately, frontend can merge them for the "Activity Feed"
    const [recentTasks, recentKyc, recentAudit] = await Promise.all([
        Task.find().populate('user', 'fullName').sort({ createdAt: -1 }).limit(5),
        KYCVerification.find({ status: 'pending' }).populate('user', 'fullName').sort({ createdAt: -1 }).limit(5),
        AuditLog.find().populate('admin', 'email').sort({ createdAt: -1 }).limit(5)
    ]);

    // 5. KYC COUNTS
    const pendingKyc = await KYCVerification.countDocuments({ status: 'pending' });

    // --- NEW: QUICK STATS CALCULATIONS (Matches Figma Bottom Right Widget) ---
    
    // Ratio: e.g. "0.2" (1 Tasker for every 5 Users)
    const userToTaskerRatio = totalTaskers > 0 ? (totalUsers / totalTaskers).toFixed(2) : 0;
    
    // Completion Rate: e.g. "85.5" (%)
    const completionRate = totalTasks > 0 ? ((taskStatus.completed / totalTasks) * 100).toFixed(1) : 0;
    
    // Avg Task Value: e.g. "20000" (Naira)
    const avgTaskValue = taskStatus.completed > 0 ? (totalRevenue / taskStatus.completed).toFixed(0) : 0;


    res.json({
      status: 'success',
      data: {
        // Top Cards
        users: { total: totalUsers, active: activeUsers },
        taskers: { total: totalTaskers },
        tasks: { total: totalTasks, ...taskStatus }, // includes active/completed/cancelled
        revenue: { total: totalRevenue },
        kyc: { pending: pendingKyc },

        // Bottom Right Widget (Calculated for UI)
        quickStats: {
            userToTaskerRatio,
            completionRate,
            avgTaskValue
        },

        // Feeds
        recentActivity: { 
            tasks: recentTasks, 
            kyc: recentKyc,
            audit: recentAudit
        }
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch stats' });
  }
};