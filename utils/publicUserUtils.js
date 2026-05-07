/**
 * Format user data for public exposure to taskers.
 * Transforms DB-flat fields into the API response shape.
 *
 * @param {Object} user - User document (can be populated/lean or full Mongoose doc)
 * @param {'full'|'limited'} scope - 'full' for tasker-authenticated, 'limited' for public
 * @returns {Object} Public user shape
 */

const SPENDING_TIERS = [
    { threshold: 1000000, label: '1M+' },
    { threshold: 500000, label: '500k+' },
    { threshold: 100000, label: '100k+' },
    { threshold: 50000, label: '50k+' },
    { threshold: 10000, label: '10k+' },
    { threshold: 5000, label: '5k+' },
    { threshold: 1000, label: '1k+' },
];

export const computeSpendingRange = (totalSpent) => {
    if (!totalSpent || totalSpent <= 0) return null;
    for (const tier of SPENDING_TIERS) {
        if (totalSpent >= tier.threshold) return tier.label;
    }
    return '<1k';
};

/**
 * Compute a trust score based on task completion ratio.
 * Formula: (completedTasks / totalTasks) * 100, clamped 0–100.
 * If totalTasks is 0, returns 0 (neutral).
 *
 * @param {number} completedTasks
 * @param {number} totalTasks
 * @returns {number} Trust score 0–100
 */
export const computeTrustScore = (completedTasks, totalTasks) => {
    if (!totalTasks || totalTasks <= 0) return 0;
    const score = (completedTasks / totalTasks) * 100;
    return Math.min(100, Math.max(0, Math.round(score)));
};

export const formatPublicUser = (user, scope = 'limited') => {
    if (!user) return null;

    const totalTasks = user.tasksPostedCount ?? 0;
    const completedTasks = user.completedTasksCount ?? 0;
    const trustScore = computeTrustScore(completedTasks, totalTasks);

    const base = {
        fullName: user.fullName || null,
        profilePicture: user.profilePicture || null,
        bio: user.bio || '',
        location: {
            residentState: user.residentState || null,
            country: user.country || null,
        },
        totalTasks,
        trustScore,
        joinedAt: user.createdAt || null,
    };

    if (scope === 'full') {
        return {
            ...base,
            tasksPostedCount: totalTasks,
            completedTasksCount: completedTasks,
            spendingRange: computeSpendingRange(user.totalSpent),
        };
    }

    return base;
};
