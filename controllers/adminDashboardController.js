import User from '../models/user.js';
import Task from '../models/task.js';
import Tasker from '../models/tasker.js';
import KYCVerification from '../models/kycVerification.js';
import AuditLog from '../models/adminAuditLog.js'; // Ensure filename matches exactly
import * as Sentry from '@sentry/node';

export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers, totalTaskers, totalTasks, pendingKyc, activeTasksCount,
      kycDiditTotal, kycManualTotal // 🚨 NEW: Count overall KYC methods
    ] = await Promise.all([
      User.countDocuments(),
      Tasker.countDocuments(),
      Task.countDocuments(),
      KYCVerification.countDocuments({ status: 'pending' }),
      Task.countDocuments({ status: { $in: ['assigned', 'in-progress'] } }),
      KYCVerification.countDocuments({ status: 'approved', provider: 'didit' }),
      KYCVerification.countDocuments({ status: 'approved', provider: { $ne: 'didit' } })
    ]);

    const tasksAgg = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, totalBudget: { $sum: '$budget' } } }
    ]);

    const taskStatus = { open: 0, assigned: 0, 'in-progress': 0, completed: 0, cancelled: 0 };
    const budgetByStatus = { open: 0, assigned: 0, 'in-progress': 0, completed: 0, cancelled: 0 };

    tasksAgg.forEach(item => { 
      taskStatus[item._id] = item.count; 
      budgetByStatus[item._id] = item.totalBudget || 0;
    });

    const totalTransaction = budgetByStatus['assigned'] + budgetByStatus['in-progress'] + budgetByStatus['completed'];
    const escrowHeld = budgetByStatus['assigned'] + budgetByStatus['in-progress'];
    const totalRevenue = budgetByStatus['completed'] * 0.15;
    const outgoingFees = budgetByStatus['completed'] * 0.85;

    const userToTaskerRatio = totalTaskers > 0 ? (totalUsers / totalTaskers).toFixed(2) : 0;
    const completionRate = totalTasks > 0 ? ((taskStatus.completed / totalTasks) * 100).toFixed(1) : 0;
    
    const tasksWithMoney = taskStatus.assigned + taskStatus['in-progress'] + taskStatus.completed;
    const avgTaskValue = tasksWithMoney > 0 ? (totalTransaction / tasksWithMoney).toFixed(0) : 0;

    const recentTasksList = await Task.find()
        .populate('user', 'fullName emailAddress profilePicture') 
        .populate('assignedTasker', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .limit(5);

    const [recentTasks, recentKyc, recentAudit] = await Promise.all([
        Task.find().populate('user', 'fullName profilePicture').sort({ createdAt: -1 }).limit(3),
        KYCVerification.find().populate('user', 'fullName profilePicture').sort({ createdAt: -1 }).limit(3),
        AuditLog.find().populate('admin', 'firstName lastName profilePicture').sort({ createdAt: -1 }).limit(3)
    ]);

    const unifiedActivity = [
        ...recentTasks.map(t => ({ type: 'task', title: 'New Task Posted', detail: t.title, date: t.createdAt })),
        ...recentKyc.map(k => ({ type: 'kyc', title: 'KYC Submitted', detail: k.user?.fullName, date: k.createdAt })),
        ...recentAudit.map(a => ({ type: 'admin', title: a.action, detail: `By Admin ${a.admin?.firstName}`, date: a.createdAt }))
    ].sort((a, b) => b.date - a.date).slice(0, 8);

    const topLocations = await Task.aggregate([
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'taskOwner' } },
        { $unwind: '$taskOwner' },
        { $match: { 'taskOwner.residentState': { $exists: true, $ne: "", $ne: null } } },
        { $group: { _id: '$taskOwner.residentState', taskCount: { $sum: 1 } } },
        { $sort: { taskCount: -1 } },
        { $limit: 5 },
        { $project: { state: '$_id', taskCount: 1, _id: 0 } }
    ]);

    const topCategories = await Tasker.aggregate([
        { $unwind: { path: '$mainCategories', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$mainCategories', taskerCount: { $sum: 1 } } },
        { $sort: { taskerCount: -1 } },
        { $limit: 3 },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'categoryData' } },
        { $unwind: '$categoryData' },
        { $project: { categoryName: '$categoryData.displayName', taskerCount: 1, _id: 0 } }
    ]);

    res.json({
      status: 'success',
      data: {
        cards: {
            totalUsers, totalTaskers, totalTasks, activeTasks: activeTasksCount, 
            completedTasks: taskStatus.completed, cancelledTasks: taskStatus.cancelled, 
            pendingKyc, totalTransaction, totalRevenue, escrowHeld, outgoingFees      
        },
        quickStats: {
            userToTaskerRatio, completionRate, avgTaskValue
        },
        analytics: {
            locations: topLocations,
            categories: topCategories,
            // 🚨 NEW: Dashboard KYC Methods
            kycMethods: {
                diditAutomated: kycDiditTotal,
                manual: kycManualTotal
            }
        },
        growth: 24, 
        recentTasks: recentTasksList,
        recentActivity: unifiedActivity
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch dashboard stats' });
  }
};

export const getTodaySignupsList = async (req, res) => {
    try {
        // 1. Define "Today"
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        // 2. Fetch both lists in parallel to keep it fast
        // Using .lean() makes the query faster because it returns raw JSON objects instead of heavy Mongoose documents
        const [usersToday, taskersToday] = await Promise.all([
            User.find({ createdAt: { $gte: startOfToday, $lte: endOfToday } })
                .select('fullName emailAddress isKYCVerified createdAt')
                .lean(),
            Tasker.find({ createdAt: { $gte: startOfToday, $lte: endOfToday } })
                .select('firstName lastName emailAddress verifyIdentity createdAt')
                .lean()
        ]);

        // 3. Standardize the User Data
        const formattedUsers = usersToday.map(user => ({
            id: user._id,
            name: user.fullName,
            email: user.emailAddress,
            role: 'User',
            isVerified: user.isKYCVerified || false, // Normalizing the flag name
            signupTime: user.createdAt
        }));

        // 4. Standardize the Tasker Data
        const formattedTaskers = taskersToday.map(tasker => ({
            id: tasker._id,
            name: `${tasker.firstName} ${tasker.lastName}`, // Combining names to match User schema
            email: tasker.emailAddress,
            role: 'Tasker',
            isVerified: tasker.verifyIdentity || false, // Normalizing the flag name
            signupTime: tasker.createdAt
        }));

        // 5. Combine and Sort (Newest signups at the top)
        const combinedList = [...formattedUsers, ...formattedTaskers].sort(
            (a, b) => new Date(b.signupTime) - new Date(a.signupTime)
        );

        // 6. Send to Frontend
        return res.status(200).json({
            status: 'success',
            data: {
                totalSignupsToday: combinedList.length,
                date: startOfToday.toISOString().split('T')[0],
                list: combinedList
            }
        });

    } catch (error) {
        console.error('Error fetching today signups list:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch today\'s signup list' });
    }
};