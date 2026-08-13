import { Router } from 'express';

function sendCesiumError(res, status, code, reason, details) {
  res.status(status).json({
    error: {
      code,
      reason,
      details
    }
  });
}

export function createCesiumRouter(options = {}) {
  const accessToken = options.accessToken ?? process.env.CESIUM_ION_ACCESS_TOKEN ?? process.env.CESIUM_ACCESS_TOKEN ?? null;
  const endpoint = options.reverseGeocodeEndpoint ?? process.env.CESIUM_REVERSE_GEOCODE_ENDPOINT ?? 'https://geocode.cesium.com/v1/reverse';
  const reverseGeocode = options.reverseGeocode ?? (async ({ latitude, longitude }) => {
    if (!accessToken) {
      throw new Error('Missing Cesium Ion access token');
    }

    const response = await fetch(`${endpoint}?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Cesium reverse geocoding failed with status ${response.status}`);
    }

    return response.json();
  });
  const router = Router();

  router.get('/cesium/reverse-geocode', async (req, res) => {
    const latitude = req.query.lat;
    const longitude = req.query.lng;
    const parsedLatitude = typeof latitude === 'string' ? Number(latitude) : Number.NaN;
    const parsedLongitude = typeof longitude === 'string' ? Number(longitude) : Number.NaN;

    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
      sendCesiumError(res, 400, 'INVALID_COORDINATES', 'Query parameters "lat" and "lng" must be valid numbers', { lat: latitude, lng: longitude });
      return;
    }

    try {
      const payload = await reverseGeocode({ latitude: parsedLatitude, longitude: parsedLongitude });
      res.status(200).json(payload);
    } catch (_error) {
      sendCesiumError(res, 500, 'REVERSE_GEOCODE_FAILED', 'Internal server error', { lat: latitude, lng: longitude });
    }
  });

  return router;
}
