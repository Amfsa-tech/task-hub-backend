import Tasker from '../models/tasker.js';
import Task from '../models/task.js';
import { calculateDistance } from '../utils/locationUtils.js';

const NEARBY_RADIUS_KM = 10;
const MAX_RESULTS = 6;

/**
 * Find nearby taskers or fall back to top-rated taskers.
 * @param {{ latitude?: number, longitude?: number }} options
 * @returns {Promise<Array>}
 */
export const findNearbyTaskers = async ({ latitude, longitude } = {}) => {
    const hasLocation = latitude != null && longitude != null;

    let query = { isActive: true };

    if (hasLocation) {
        // Bounding box pre-filter (~10 km)
        const latDelta = NEARBY_RADIUS_KM / 111.32;
        const lngDelta = NEARBY_RADIUS_KM / (111.32 * Math.cos(latitude * Math.PI / 180));

        query['location.latitude'] = {
            $gte: latitude - latDelta,
            $lte: latitude + latDelta
        };
        query['location.longitude'] = {
            $gte: longitude - lngDelta,
            $lte: longitude + lngDelta
        };
    }

    // Fetch candidates sorted by rating, with extra buffer for precise filtering
    const limit = hasLocation ? MAX_RESULTS * 5 : MAX_RESULTS;
    const taskers = await Tasker.find(query)
        .select('firstName lastName profilePicture averageRating area residentState location subCategories')
        .populate({ path: 'subCategories', select: 'displayName', options: { limit: 1 } })
        .sort({ averageRating: -1 })
        .limit(limit)
        .lean();

    let results = taskers;

    // Precise Haversine filter when location is provided
    if (hasLocation) {
        const radiusMeters = NEARBY_RADIUS_KM * 1000;
        results = taskers
            .filter(t => t.location?.latitude != null && t.location?.longitude != null)
            .map(t => {
                const distance = calculateDistance(latitude, longitude, t.location.latitude, t.location.longitude);
                return { ...t, distance };
            })
            .filter(t => t.distance <= radiusMeters)
            .sort((a, b) => b.averageRating - a.averageRating)
            .slice(0, MAX_RESULTS);

        // Fallback: fill remaining slots with top-rated taskers if not enough nearby
        if (results.length < MAX_RESULTS) {
            const nearbyIds = new Set(results.map(t => t._id.toString()));
            const fillCount = MAX_RESULTS - results.length;
            const fallback = await Tasker.find({ isActive: true, _id: { $nin: [...nearbyIds] } })
                .select('firstName lastName profilePicture averageRating area residentState location subCategories')
                .populate({ path: 'subCategories', select: 'displayName', options: { limit: 1 } })
                .sort({ averageRating: -1 })
                .limit(fillCount)
                .lean();
            results = [...results, ...fallback];
        }
    }

    // Aggregate completed job counts
    const taskerIds = results.map(t => t._id);
    const jobCounts = await Task.aggregate([
        { $match: { assignedTasker: { $in: taskerIds }, status: 'completed' } },
        { $group: { _id: '$assignedTasker', count: { $sum: 1 } } }
    ]);
    const jobCountMap = Object.fromEntries(jobCounts.map(j => [j._id.toString(), j.count]));

    return results.map(t => ({
        _id: t._id,
        firstName: t.firstName,
        lastName: t.lastName,
        profilePicture: t.profilePicture,
        averageRating: t.averageRating,
        completedJobs: jobCountMap[t._id.toString()] || 0,
        primaryCategory: t.subCategories?.[0]?.displayName || null,
        area: t.area || null,
        residentState: t.residentState,
        ...(hasLocation && t.distance != null ? { distance: Math.round((t.distance / 1000) * 10) / 10 } : {})
    }));
};
