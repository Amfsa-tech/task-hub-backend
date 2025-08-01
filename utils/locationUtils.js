export const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const milesToMeters = (miles) => miles * 1609.34;
 const metersToMiles = (meters) => meters / 1609.34;

 const isWithinRadius = (centerLat, centerLng, pointLat, pointLng, radiusMeters) => {
    const distance = calculateDistance(centerLat, centerLng, pointLat, pointLng);
    return distance <= radiusMeters;
};

export default  { calculateDistance, milesToMeters, metersToMiles, isWithinRadius };
