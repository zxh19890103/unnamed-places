import express, { Router } from 'express';

const Z12_TILE_LIMIT = 2 ** 12;

function sendZ12GeoInfoError(res, status, code, reason, details) {
  res.status(status).json({
    error: {
      code,
      reason,
      details
    }
  });
}

function parseZ12Coordinate(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const coordinate = Number(value);
  if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate >= Z12_TILE_LIMIT) {
    return null;
  }

  return coordinate;
}

function parseCanonicalZ12Key(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^12\/(\d+)\/(\d+)$/.exec(value);
  if (!match) {
    return null;
  }

  const x = parseZ12Coordinate(match[1]);
  const y = parseZ12Coordinate(match[2]);
  if (x === null || y === null) {
    return null;
  }

  const key = `12/${x}/${y}`;
  return value === key ? key : null;
}

function isJsonObjectOrArray(value) {
  return Array.isArray(value) || (value !== null && typeof value === 'object');
}

function toResponse(record) {
  return {
    z12_key: record.z12_key,
    display_name: record.display_name,
    raw_data: record.raw_data
  };
}

export function createZ12GeoInfoRouter({ z12GeoInfoStore } = {}) {
  if (!z12GeoInfoStore || typeof z12GeoInfoStore.upsert !== 'function' || typeof z12GeoInfoStore.get !== 'function') {
    throw new Error('z12GeoInfoStore with upsert and get methods is required');
  }

  const router = Router();
  router.use(express.json());

  router.post('/z12geoinfo', async (req, res) => {
    const z12Key = parseCanonicalZ12Key(req.body?.z12_key);
    const displayName = req.body?.display_name;
    const rawData = req.body?.raw_data;

    if (!z12Key || typeof displayName !== 'string' || !displayName.trim() || !isJsonObjectOrArray(rawData)) {
      sendZ12GeoInfoError(res, 400, 'INVALID_Z12_GEOINFO', 'Body must contain a canonical z12_key, non-empty display_name, and JSON object or array raw_data', {
        z12_key: req.body?.z12_key
      });
      return;
    }

    const record = await z12GeoInfoStore.upsert({
      z12Key,
      displayName,
      rawData
    });

    res.status(200).json(toResponse(record));
  });

  router.get('/z12geoinfo/12/:x/:y', async (req, res) => {
    const x = parseZ12Coordinate(req.params.x);
    const y = parseZ12Coordinate(req.params.y);

    if (x === null || y === null) {
      sendZ12GeoInfoError(res, 400, 'INVALID_TILE_COORDS', 'Tile coordinates must be integers between 0 and 4095', {
        x: req.params.x,
        y: req.params.y
      });
      return;
    }

    const z12Key = `12/${x}/${y}`;
    const record = await z12GeoInfoStore.get(z12Key);
    if (!record) {
      sendZ12GeoInfoError(res, 404, 'Z12_GEOINFO_NOT_FOUND', 'No geo info exists for this z12 tile', { z12_key: z12Key });
      return;
    }

    res.status(200).json(toResponse(record));
  });

  return router;
}