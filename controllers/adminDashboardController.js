import User from '../models/user.js';
import Task from '../models/task.js';
import Tasker from '../models/tasker.js';
import KYCVerification from '../models/kycVerification.js';
import AuditLog from '../models/adminAuditLog.js';

export const getDashboardStats = async (req, res) => {
  try {
    // 1. RAW COUNTS & CARD METRICS
    const [
      totalUsers, 
      totalTaskers, 
      totalTasks, 
      pendingKyc,
      activeTasksCount
    ] = await Promise.all([
      User.countDocuments(),
      Tasker.countDocuments(),
      Task.countDocuments(),
      KYCVerification.countDocuments({ status: 'pending' }),
      Task.countDocuments({ status: { $in: ['assigned', 'in-progress'] } })
    ]);

    // 2. TASK STATUS & FINANCIAL AGGREGATION
    // We group by status and sum the budgets to calculate all financial metrics accurately
    const tasksAgg = await Task.aggregate([
      { 
        $group: { 
          _id: '$status', 
          count: { $sum: 1 },
          totalBudget: { $sum: '$budget' } 
        } 
      }
    ]);

    const taskStatus = { open: 0, assigned: 0, 'in-progress': 0, completed: 0, cancelled: 0 };
    const budgetByStatus = { open: 0, assigned: 0, 'in-progress': 0, completed: 0, cancelled: 0 };

    tasksAgg.forEach(item => { 
      taskStatus[item._id] = item.count; 
      budgetByStatus[item._id] = item.totalBudget || 0;
    });

    // 3. APPLY FINANCIAL BUSINESS LOGIC
    // Total Transaction: Sum of all budgets for tasks that have moved money (assigned, in-progress, completed)
    const totalTransaction = budgetByStatus['assigned'] + budgetByStatus['in-progress'] + budgetByStatus['completed'];

    // Escrow Held: Full task amount deducted when assigned, drops when completed (so only active ones)
    const escrowHeld = budgetByStatus['assigned'] + budgetByStatus['in-progress'];

    // Total Revenue: 15% commission strictly on completed tasks
    const totalRevenue = budgetByStatus['completed'] * 0.15;

    // Outgoing Fees: 85% paid out to taskers strictly on completed tasks
    const outgoingFees = budgetByStatus['completed'] * 0.85;

    // 4. QUICK STATS WIDGET
    const userToTaskerRatio = totalTaskers > 0 ? (totalUsers / totalTaskers).toFixed(2) : 0;
    const completionRate = totalTasks > 0 ? ((taskStatus.completed / totalTasks) * 100).toFixed(1) : 0;
    
    // Avg Task Value: Uses total transaction value divided by tasks that actually had money tied to them
    const tasksWithMoney = taskStatus.assigned + taskStatus['in-progress'] + taskStatus.completed;
    const avgTaskValue = tasksWithMoney > 0 ? (totalTransaction / tasksWithMoney).toFixed(0) : 0;

    // 5. RECENT TASKS TABLE (Populated with profile pictures for both User and Tasker)
    const recentTasksList = await Task.find()
        .populate('user', 'fullName emailAddress profilePicture') 
        .populate('assignedTasker', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .limit(5);

    // 6. UNIFIED ACTIVITY FEED
    const [recentTasks, recentKyc, recentAudit] = await Promise.all([
        Task.find().populate('user', 'fullName profilePicture').sort({ createdAt: -1 }).limit(3),
        KYCVerification.find().populate('user', 'fullName profilePicture').sort({ createdAt: -1 }).limit(3),
        AuditLog.find().populate('admin', 'firstName lastName profilePicture').sort({ createdAt: -1 }).limit(3)
    ]);

    // Merge and sort for the UI Timeline
    const unifiedActivity = [
        ...recentTasks.map(t => ({ type: 'task', title: 'New Task Posted', detail: t.title, date: t.createdAt })),
        ...recentKyc.map(k => ({ type: 'kyc', title: 'KYC Submitted', detail: k.user?.fullName, date: k.createdAt })),
        ...recentAudit.map(a => ({ type: 'admin', title: a.action, detail: `By Admin ${a.admin?.firstName}`, date: a.createdAt }))
    ].sort((a, b) => b.date - a.date).slice(0, 8);
     // ---------------------------------------------------------
    // --- NEW: LOCATION & CATEGORY ANALYTICS ---
    // ---------------------------------------------------------

    // 1. Top Locations (Most Tasks Location)
    // We join the Task with the User who posted it, and group by their residentState
    const topLocations = await Task.aggregate([
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'taskOwner'
            }
        },
        { $unwind: '$taskOwner' },
        { 
            $match: { 
                'taskOwner.residentState': { $exists: true, $ne: "", $ne: null } 
            } 
        },
        {
            $group: {
                _id: '$taskOwner.residentState',
                taskCount: { $sum: 1 }
            }
        },
        { $sort: { taskCount: -1 } },
        { $limit: 5 },
        {
            $project: {
                state: '$_id',
                taskCount: 1,
                _id: 0
            }
        }
    ]);

    // 2. Top Categories (Categories with the highest number of Taskers)
    // We unwind the Tasker's mainCategories array, group them, and join with the Category DB
    const topCategories = await Tasker.aggregate([
        { $unwind: { path: '$mainCategories', preserveNullAndEmptyArrays: false } },
        {
            $group: {
                _id: '$mainCategories',
                taskerCount: { $sum: 1 }
            }
        },
        { $sort: { taskerCount: -1 } },
        { $limit: 3 }, // Limiting to the top 3 main categories as requested
        {
            $lookup: {
                from: 'categories',
                localField: '_id',
                foreignField: '_id',
                as: 'categoryData'
            }
        },
        { $unwind: '$categoryData' },
        {
            $project: {
                categoryName: '$categoryData.displayName', // Using displayName for the UI
                taskerCount: 1,
                _id: 0
            }
        }
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
        
        // --- NEW ANALYTICS OBJECT ADDED HERE ---
        analytics: {
            locations: topLocations,
            categories: topCategories
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