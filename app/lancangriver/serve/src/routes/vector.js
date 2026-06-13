import { Router } from 'express';
import { queryVectorFeatures as defaultQueryVectorFeatures } from '../db.js';

const INVALID_BBOX_MESSAGE = 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat';

function parseBbox(rawBbox) {
  if (typeof rawBbox !== 'string') {
    return null;
  }

  const values = rawBbox.split(',').map((part) => Number.parseFloat(part.trim()));

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = values;

  if (minLon >= maxLon || minLat >= maxLat) {
    return null;
  }

  return values;
}

export function createVectorRouter(options = {}) {
  const queryVectorFeatures = options.queryVectorFeatures ?? defaultQueryVectorFeatures;
  const router = Router();

  router.get('/vector', async (req, res) => {
    const bbox = parseBbox(req.query.bbox);

    if (!bbox) {
      res.status(400).json({ error: INVALID_BBOX_MESSAGE });
      return;
    }

    try {
      const featureCollection = await queryVectorFeatures(bbox);
      res.status(200).json(featureCollection);
    } catch (_error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
