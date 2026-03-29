import { findNearbyTaskers } from '../services/nearbyTaskerService.js';

export const getNearbyTaskers = async (req, res) => {
    try {
        const { latitude, longitude } = req.query;

        let lat, lng;

        if (latitude != null && longitude != null) {
            lat = parseFloat(latitude);
            lng = parseFloat(longitude);

            if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                // Invalid coordinates — fall back to no-location behavior
                lat = undefined;
                lng = undefined;
            }
        }

        const taskers = await findNearbyTaskers({ latitude: lat, longitude: lng });

        return res.status(200).json({
            success: true,
            data: taskers
        });
    } catch (error) {
        console.error('Error fetching nearby taskers:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch nearby taskers'
        });
    }
};
