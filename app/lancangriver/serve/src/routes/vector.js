import { Router } from 'express';
import {
  queryVectorFeatures as defaultQueryVectorFeatures,
  queryVectorFeaturesHighways as defaultQueryVectorFeaturesHighways,
  queryVectorFeaturesPlaces as defaultQueryVectorFeaturesPlaces,
  queryVectorFeaturesWaters as defaultQueryVectorFeaturesWaters,
} from '../db.js';

const INVALID_BBOX_MESSAGE = 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat';
const STRICT_NUMERIC_TOKEN_RE = /^[+-]?(?:\d+\.\d+|\d+\.?|\.\d+)(?:[eE][+-]?\d+)?$/;

function getRawBbox(rawBbox) {
  return typeof rawBbox === 'string' ? rawBbox : null;
}

function sendVectorError(res, status, code, reason, rawBbox) {
  res.status(status).json({
    error: {
      code,
      reason,
      bbox: getRawBbox(rawBbox),
    },
  });
}

function parseBbox(rawBbox) {
  if (typeof rawBbox !== 'string') {
    return null;
  }

  const parts = rawBbox.split(',').map((part) => part.trim());

  if (parts.length !== 4) {
    return null;
  }

  if (parts.some((part) => part.length === 0 || !STRICT_NUMERIC_TOKEN_RE.test(part))) {
    return null;
  }

  const values = parts.map((part) => Number(part));

  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = values;

  const lonInRange = minLon >= -180 && minLon <= 180 && maxLon >= -180 && maxLon <= 180;
  const latInRange = minLat >= -90 && minLat <= 90 && maxLat >= -90 && maxLat <= 90;

  if (!lonInRange || !latInRange) {
    return null;
  }

  if (minLon >= maxLon || minLat >= maxLat) {
    return null;
  }

  return values;
}

export function createVectorRouter(options = {}) {
  const queryVectorFeatures = options.queryVectorFeatures ?? defaultQueryVectorFeatures;
  const queryVectorFeaturesHighways =
    options.queryVectorFeaturesHighways ?? defaultQueryVectorFeaturesHighways;
  const queryVectorFeaturesWaters =
    options.queryVectorFeaturesWaters ?? defaultQueryVectorFeaturesWaters;
  const queryVectorFeaturesPlaces =
    options.queryVectorFeaturesPlaces ?? defaultQueryVectorFeaturesPlaces;
  const router = Router();

  router.get('/vector', async (req, res) => {
    const rawBbox = req.query.bbox;
    const bbox = parseBbox(rawBbox);

    if (!bbox) {
      sendVectorError(res, 400, 'INVALID_BBOX', INVALID_BBOX_MESSAGE, rawBbox);
      return;
    }

    try {
      const featureCollection = await queryVectorFeatures(bbox);
      res.status(200).json(featureCollection);
    } catch (_error) {
      sendVectorError(res, 500, 'VECTOR_QUERY_FAILED', 'Internal server error', rawBbox);
    }
  });

  router.get('/vector/highways', async (req, res) => {
    const rawBbox = req.query.bbox;
    const bbox = parseBbox(rawBbox);

    if (!bbox) {
      sendVectorError(res, 400, 'INVALID_BBOX', INVALID_BBOX_MESSAGE, rawBbox);
      return;
    }

    try {
      const featureCollection = await queryVectorFeaturesHighways(bbox);
      res.status(200).json(featureCollection);
    } catch (_error) {
      sendVectorError(res, 500, 'VECTOR_QUERY_FAILED', 'Internal server error', rawBbox);
    }
  });

  router.get('/vector/waters', async (req, res) => {
    const rawBbox = req.query.bbox;
    const bbox = parseBbox(rawBbox);

    if (!bbox) {
      sendVectorError(res, 400, 'INVALID_BBOX', INVALID_BBOX_MESSAGE, rawBbox);
      return;
    }

    try {
      const featureCollection = await queryVectorFeaturesWaters(bbox);
      res.status(200).json(featureCollection);
    } catch (_error) {
      sendVectorError(res, 500, 'VECTOR_QUERY_FAILED', 'Internal server error', rawBbox);
    }
  });

  router.get('/vector/places', async (req, res) => {
    const rawBbox = req.query.bbox;
    const bbox = parseBbox(rawBbox);

    if (!bbox) {
      sendVectorError(res, 400, 'INVALID_BBOX', INVALID_BBOX_MESSAGE, rawBbox);
      return;
    }

    try {
      const featureCollection = await queryVectorFeaturesPlaces(bbox);
      res.status(200).json(featureCollection);
    } catch (_error) {
      sendVectorError(res, 500, 'VECTOR_QUERY_FAILED', 'Internal server error', rawBbox);
    }
  });

  return router;
}
