
import User from '../models/user.js';
import Task from '../models/task.js';
import Report from '../models/report.js';
import Tasker from '../models/tasker.js';
import KYCVerification from '../models/kycVerification.js';

export const getDashboardStats = async (req, res) => {
  try {
    // USERS
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });

    // TASKERS
    const totalTaskers = await Tasker.countDocuments();
    const activeTaskers = await Tasker.countDocuments({ isActive: true });

    // TASKS
    const totalTasks = await Task.countDocuments();

    const tasksByStatusAgg = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const taskStatus = {
      open: 0,
      assigned: 0,
      'in-progress': 0,
      completed: 0,
      cancelled: 0
    };

    tasksByStatusAgg.forEach(item => {
      taskStatus[item._id] = item.count;
    });

    // REPORTS
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const resolvedReports = await Report.countDocuments({ status: 'resolved' });

    // ESCROW (READ-ONLY)
    const escrowAgg = await Task.aggregate([
      { $match: { isEscrowHeld: true } },
      { $group: { _id: null, total: { $sum: '$escrowAmount' } } }
    ]);
    const escrowHeld = escrowAgg[0]?.total || 0;

    // TOTAL REVENUE
    const revenueAgg = await Task.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$budget' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // RECENT ACTIVITY
    const recentTasks = await Task.find()
      .populate('user', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentReports = await Report.find()
      .populate('reporter', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5);

    // TASKS BY CATEGORY
    const tasksByCategory = await Task.aggregate([
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } }
    ]);

    // KYC STATS
    const kycAgg = await KYCVerification.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const kycStats = { pending: 0, approved: 0, rejected: 0 };
    kycAgg.forEach(k => {
      kycStats[k._id] = k.count;
    });

    res.json({
      status: 'success',
      data: {
        users: { total: totalUsers, active: activeUsers },
        taskers: { total: totalTaskers, active: activeTaskers },
        tasks: { total: totalTasks, byStatus: taskStatus },
        reports: { pending: pendingReports, resolved: resolvedReports },
        escrow: { held: escrowHeld },
        revenue: { total: totalRevenue },
        recentActivity: { tasks: recentTasks, reports: recentReports },
        charts: { tasksByCategory },
        kyc: kycStats
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch dashboard stats'
    });
  }
};
