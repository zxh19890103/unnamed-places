import { Router } from 'express';

const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const DEFAULT_USER_AGENT = 'lancangriver-serve/1.0 (reverse geocoding)';

function sendNominatimError(res, status, code, reason, details) {
  res.status(status).json({
    error: {
      code,
      reason,
      details,
    },
  });
}

/**
 * GET /nominatim/geo-reverse?lat=35.681236&lng=139.767125
 *
 * Proxies https://nominatim.openstreetmap.org/reverse?...&format=jsonv2
 * Verified response shape (upstream, passed through unchanged):
 * {
 *   place_id: number,
 *   licence: string,
 *   osm_type: 'node' | 'way' | 'relation',
 *   osm_id: number,
 *   lat: string, lon: string,
 *   category: string,        // e.g. 'highway'
 *   type: string,            // e.g. 'elevator'
 *   place_rank: number,
 *   importance: number,
 *   addresstype: string,
 *   name: string,
 *   display_name: string,
 *   address: {               // keys vary by location
 *     road?, neighbourhood?, quarter?, city?, state?, 'ISO3166-2-lvl4'?,
 *     postcode?, country?, country_code?
 *   },
 *   boundingbox: [string, string, string, string] // [minLat, maxLat, minLon, maxLon]
 * }
 * On no match upstream returns: { error: 'Unable to geocode' } with HTTP 200.
 */
export function createNominatimRouter(options = {}) {
  const endpoint =
    options.nominatimEndpoint ?? process.env.NOMINATIM_REVERSE_ENDPOINT ?? DEFAULT_ENDPOINT;
  const userAgent =
    options.nominatimUserAgent ?? process.env.NOMINATIM_USER_AGENT ?? DEFAULT_USER_AGENT;
  const reverseGeocode =
    options.nominatimReverseGeocode ??
    (async ({ latitude, longitude, zoom }) => {
      const url = new URL(endpoint);
      url.searchParams.set('lat', String(latitude));
      url.searchParams.set('lon', String(longitude));
      url.searchParams.set('format', 'jsonv2');
      if (Number.isFinite(zoom)) {
        url.searchParams.set('zoom', String(zoom));
      }

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          // Nominatim usage policy requires an identifying User-Agent.
          'User-Agent': userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`Nominatim reverse geocoding failed with status ${response.status}`);
      }

      return response.json();
    });

  const router = Router();

  router.get('/nominatim/geo-reverse', async (req, res) => {
    const latitude = req.query.lat;
    const longitude = req.query.lng ?? req.query.lon;
    const parsedLatitude = typeof latitude === 'string' ? Number(latitude) : Number.NaN;
    const parsedLongitude = typeof longitude === 'string' ? Number(longitude) : Number.NaN;

    if (
      !Number.isFinite(parsedLatitude) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90 ||
      !Number.isFinite(parsedLongitude) ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      sendNominatimError(
        res,
        400,
        'INVALID_COORDINATES',
        'Query parameters "lat" and "lng" must be valid coordinates',
        {
          lat: latitude,
          lng: longitude,
        },
      );
      return;
    }

    const zoomRaw = req.query.zoom;
    const parsedZoom = typeof zoomRaw === 'string' ? Number(zoomRaw) : Number.NaN;

    if (
      typeof zoomRaw === 'string' &&
      (!Number.isInteger(parsedZoom) || parsedZoom < 0 || parsedZoom > 18)
    ) {
      sendNominatimError(
        res,
        400,
        'INVALID_ZOOM',
        'Query parameter "zoom" must be an integer between 0 and 18',
        {
          zoom: zoomRaw,
        },
      );
      return;
    }

    try {
      const payload = await reverseGeocode({
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        zoom: parsedZoom,
      });
      res.status(200).json(payload);
    } catch (_error) {
      sendNominatimError(res, 502, 'REVERSE_GEOCODE_FAILED', 'Upstream reverse geocoding failed', {
        lat: parsedLatitude,
        lng: parsedLongitude,
      });
    }
  });

  return router;
}
