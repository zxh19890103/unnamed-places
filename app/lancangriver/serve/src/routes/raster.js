import { Router } from 'express';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_SATELLITE_URL_TEMPLATE = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&scale=4';

function templateUrl(template, values) {
  return template.replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function isExistingPath(filePath) {
  return access(filePath)
    .then(() => true)
    .catch(() => false);
}

function createInFlightMap() {
  return new Map();
}

async function runWithInFlight(map, key, task) {
  if (map.has(key)) {
    return map.get(key);
  }

  const promise = (async () => {
    try {
      return await task();
    } finally {
      map.delete(key);
    }
  })();

  map.set(key, promise);
  return promise;
}

async function writeAtomicFile(filePath, data) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, data);
  await rename(tempPath, filePath);
}

async function ensureDirectory(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

function parseTileCoordinate(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validateTileCoordinates(z, x, y) {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    return false;
  }

  if (z < 0 || x < 0 || y < 0) {
    return false;
  }

  const limit = 2 ** z;
  return x < limit && y < limit;
}

export function zxyToBBox(z, x, y) {
  const tileCount = 2 ** z;
  const west = (x / tileCount) * 360 - 180;
  const east = ((x + 1) / tileCount) * 360 - 180;

  const north = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / tileCount)));
  const south =
    (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / tileCount)));

  return [west, south, east, north];
}

export function buildRasterPaths(rasterRoot, z, x, y) {
  const tileRoot = resolve(rasterRoot, String(z), String(x), String(y));

  return {
    tileRoot,
    satellitePath: join(tileRoot, 'satellite.jpeg'),
    demPngPath: join(tileRoot, 'dem.png')
  };
}

async function downloadToFile(url, filePath, fetchImpl) {
  if (await isExistingPath(filePath)) {
    return { path: filePath, cached: true };
  }

  await ensureDirectory(filePath);
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeAtomicFile(filePath, buffer);

  return { path: filePath, cached: false };
}

async function defaultFetchSatelliteTile(z, x, y, rasterOptions) {
  const { rasterRoot, fetchImpl, satelliteUrlTemplate } = rasterOptions;
  const { satellitePath } = buildRasterPaths(rasterRoot, z, x, y);
  const url = templateUrl(satelliteUrlTemplate, { z, x, y });

  return downloadToFile(url, satellitePath, fetchImpl);
}

async function defaultResolveDemPngPath(z, x, y, rasterOptions) {
  const { demPngPath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
  const exists = await isExistingPath(demPngPath);

  if (!exists) {
    const error = new Error('dem.png file was not found for tile');
    error.code = 'DEM_PNG_NOT_FOUND';
    throw error;
  }

  return { path: demPngPath, cached: true };
}

const satelliteInFlight = createInFlightMap();
const demPngInFlight = createInFlightMap();

function createRasterHandlerOptions(options = {}) {
  const rasterOptions = options.raster ?? options;

  return {
    rasterRoot: rasterOptions.rasterRoot ? resolve(rasterOptions.rasterRoot) : resolve('.tiles'),
    satelliteUrlTemplate: rasterOptions.satelliteUrlTemplate ?? DEFAULT_SATELLITE_URL_TEMPLATE,
    fetchImpl: rasterOptions.fetchImpl ?? fetch,
    fetchSatelliteTile: rasterOptions.fetchSatelliteTile,
    resolveDemPngPath: rasterOptions.resolveDemPngPath
  };
}

function sendRasterError(res, status, code, reason) {
  res.status(status).json({
    error: {
      code,
      reason
    }
  });
}

async function sendRasterFile(res, filePath, contentType) {
  const resolvedPath = resolve(filePath);

  res.type(contentType);
  res.set('Cache-Control', 'public, max-age=3600');

  await new Promise((resolveSend, rejectSend) => {
    res.sendFile(resolvedPath, (error) => {
      if (error) {
        rejectSend(error);
        return;
      }

      resolveSend();
    });
  });
}

export function createRasterRouter(options = {}) {
  const rasterOptions = createRasterHandlerOptions(options);
  const router = Router();

  const fetchSatelliteTile =
    rasterOptions.fetchSatelliteTile ?? ((z, x, y) => defaultFetchSatelliteTile(z, x, y, rasterOptions));
  const resolveDemPngPath =
    rasterOptions.resolveDemPngPath ?? ((z, x, y) => defaultResolveDemPngPath(z, x, y, rasterOptions));

  async function fetchSatelliteTileOnce(z, x, y) {
    const { satellitePath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
    return runWithInFlight(satelliteInFlight, satellitePath, () => fetchSatelliteTile(z, x, y));
  }

  async function resolveDemPngPathOnce(z, x, y) {
    const { demPngPath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
    return runWithInFlight(demPngInFlight, demPngPath, () => resolveDemPngPath(z, x, y));
  }

  router.get('/raster/satellite/:z/:x/:y.jpeg', async (req, res) => {
    const z = parseTileCoordinate(req.params.z);
    const x = parseTileCoordinate(req.params.x);
    const y = parseTileCoordinate(req.params.y);

    if (!validateTileCoordinates(z, x, y)) {
      sendRasterError(res, 400, 'INVALID_TILE_COORDINATES', 'Invalid z/x/y tile coordinates');
      return;
    }

    try {
      const satelliteResult = await fetchSatelliteTileOnce(z, x, y);
      const satellitePath = satelliteResult.satellitePath ?? satelliteResult.path;
      await sendRasterFile(res, satellitePath, 'image/jpeg');
    } catch (_error) {
      sendRasterError(res, 500, 'SATELLITE_TILE_STREAM_FAILED', 'Internal server error');
    }
  });

  router.get('/raster/dem/:z/:x/:y.png', async (req, res) => {
    const z = parseTileCoordinate(req.params.z);
    const x = parseTileCoordinate(req.params.x);
    const y = parseTileCoordinate(req.params.y);

    if (!validateTileCoordinates(z, x, y)) {
      sendRasterError(res, 400, 'INVALID_TILE_COORDINATES', 'Invalid z/x/y tile coordinates');
      return;
    }

    try {
      const pngResult = await resolveDemPngPathOnce(z, x, y);
      const pngPath = pngResult.pngPath ?? pngResult.path;
      await sendRasterFile(res, pngPath, 'image/png');
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'DEM_PNG_NOT_FOUND') {
        sendRasterError(res, 404, 'DEM_PNG_NOT_FOUND', 'dem.png file was not found for tile');
        return;
      }

      sendRasterError(res, 500, 'DEM_PNG_STREAM_FAILED', 'Internal server error');
    }
  });

  router.get('/raster/satellite/:z/:x/:y', async (req, res) => {
    const z = parseTileCoordinate(req.params.z);
    const x = parseTileCoordinate(req.params.x);
    const y = parseTileCoordinate(req.params.y);

    if (!validateTileCoordinates(z, x, y)) {
      sendRasterError(res, 400, 'INVALID_TILE_COORDINATES', 'Invalid z/x/y tile coordinates');
      return;
    }

    try {
      const result = await fetchSatelliteTileOnce(z, x, y);
      res.status(200).json({
        ok: true,
        kind: 'satellite',
        ...result
      });
    } catch (_error) {
      sendRasterError(res, 500, 'SATELLITE_TILE_FAILED', 'Internal server error');
    }
  });

  router.get('/raster/dem/:z/:x/:y', async (req, res) => {
    const z = parseTileCoordinate(req.params.z);
    const x = parseTileCoordinate(req.params.x);
    const y = parseTileCoordinate(req.params.y);

    if (!validateTileCoordinates(z, x, y)) {
      sendRasterError(res, 400, 'INVALID_TILE_COORDINATES', 'Invalid z/x/y tile coordinates');
      return;
    }

    try {
      const pngResult = await resolveDemPngPathOnce(z, x, y);

      res.status(200).json({
        ok: true,
        kind: 'dem',
        pngPath: pngResult.pngPath ?? pngResult.path,
        pngCached: pngResult.pngCached ?? pngResult.cached ?? true
      });
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'DEM_PNG_NOT_FOUND') {
        sendRasterError(res, 404, 'DEM_PNG_NOT_FOUND', 'dem.png file was not found for tile');
        return;
      }

      sendRasterError(res, 500, 'DEM_TILE_FAILED', 'Internal server error');
    }
  });

  router.get('/raster/dem/:z/:x/:y/png', async (req, res) => {
    const z = parseTileCoordinate(req.params.z);
    const x = parseTileCoordinate(req.params.x);
    const y = parseTileCoordinate(req.params.y);

    if (!validateTileCoordinates(z, x, y)) {
      sendRasterError(res, 400, 'INVALID_TILE_COORDINATES', 'Invalid z/x/y tile coordinates');
      return;
    }

    try {
      const pngResult = await resolveDemPngPathOnce(z, x, y);

      res.status(200).json({
        ok: true,
        kind: 'dem-png',
        path: pngResult.pngPath ?? pngResult.path,
        cached: pngResult.pngCached ?? pngResult.cached ?? true
      });
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'DEM_PNG_NOT_FOUND') {
        sendRasterError(res, 404, 'DEM_PNG_NOT_FOUND', 'dem.png file was not found for tile');
        return;
      }

      sendRasterError(res, 500, 'DEM_PNG_RENDER_FAILED', 'Internal server error');
    }
  });

  return router;
}
