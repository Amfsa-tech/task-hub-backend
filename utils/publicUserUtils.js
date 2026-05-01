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

export const formatPublicUser = (user, scope = 'limited') => {
    if (!user) return null;

    const base = {
        fullName: user.fullName || null,
        profilePicture: user.profilePicture || null,
        location: {
            residentState: user.residentState || null,
            country: user.country || null,
        },
    };

    if (scope === 'full') {
        return {
            ...base,
            tasksPostedCount: user.tasksPostedCount ?? 0,
            spendingRange: computeSpendingRange(user.totalSpent),
        };
    }

    return base;
};
