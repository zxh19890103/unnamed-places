import { Router } from 'express';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fromFile } from 'geotiff';
import { PNG } from 'pngjs';

const DEFAULT_SATELLITE_URL_TEMPLATE = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&scale=4';
const DEFAULT_OPENTOPOGRAPHY_URL_TEMPLATE =
  'https://portal.opentopography.org/API/globaldem?demtype=SRTMGL1&south={south}&north={north}&west={west}&east={east}&outputFormat=GTiff&API_Key={apiKey}';

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
    demGtiffPath: join(tileRoot, 'dem.gtiff'),
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

async function defaultFetchDemTile(z, x, y, rasterOptions) {
  const { rasterRoot, fetchImpl, openTopographyApiKey, openTopographyUrlTemplate } = rasterOptions;

  if (!openTopographyApiKey) {
    throw new Error('OPEN_TOPOGRAPHY_API_KEY is required for DEM tiles');
  }

  const { demGtiffPath } = buildRasterPaths(rasterRoot, z, x, y);
  const [west, south, east, north] = zxyToBBox(z, x, y);
  const url = templateUrl(openTopographyUrlTemplate, {
    apiKey: openTopographyApiKey,
    west,
    south,
    east,
    north
  });

  return downloadToFile(url, demGtiffPath, fetchImpl);
}

async function normalizeRaster(values) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }

    if (value < min) {
      min = value;
    }

    if (value > max) {
      max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    throw new Error('Raster contains no usable elevation values');
  }

  const scale = 255 / (max - min);
  return values.map((value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }

    const normalized = Math.round((value - min) * scale);
    return Math.max(0, Math.min(255, normalized));
  });
}

async function defaultRenderDemPng(gtiffPath, z, x, y, rasterOptions) {
  const { demPngPath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);

  if (await isExistingPath(demPngPath)) {
    return { path: demPngPath, cached: true };
  }

  await ensureDirectory(demPngPath);
  const tiff = await fromFile(gtiffPath);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const [raster] = await image.readRasters({ samples: [0] });
  const pixels = await normalizeRaster(raster);
  const png = new PNG({ width, height });

  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    const value = pixels[index];
    png.data[offset] = value;
    png.data[offset + 1] = value;
    png.data[offset + 2] = value;
    png.data[offset + 3] = 255;
  }

  await writeAtomicFile(demPngPath, PNG.sync.write(png));

  return { path: demPngPath, cached: false };
}

const satelliteInFlight = createInFlightMap();
const demInFlight = createInFlightMap();
const demPngInFlight = createInFlightMap();

function createRasterHandlerOptions(options = {}) {
  const rasterOptions = options.raster ?? options;

  return {
    rasterRoot: rasterOptions.rasterRoot ? resolve(rasterOptions.rasterRoot) : resolve('tiles'),
    openTopographyApiKey:
      rasterOptions.openTopographyApiKey ??
      process.env.OPENTOPOGRAPHY_API_KEY ??
      process.env.OPEN_TOPOGRAPHY_API_KEY ??
      '',
    openTopographyUrlTemplate:
      rasterOptions.openTopographyUrlTemplate ?? DEFAULT_OPENTOPOGRAPHY_URL_TEMPLATE,
    satelliteUrlTemplate: rasterOptions.satelliteUrlTemplate ?? DEFAULT_SATELLITE_URL_TEMPLATE,
    fetchImpl: rasterOptions.fetchImpl ?? fetch,
    fetchSatelliteTile: rasterOptions.fetchSatelliteTile,
    fetchDemTile: rasterOptions.fetchDemTile,
    renderDemPng: rasterOptions.renderDemPng
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

export function createRasterRouter(options = {}) {
  const rasterOptions = createRasterHandlerOptions(options);
  const router = Router();

  const fetchSatelliteTile =
    rasterOptions.fetchSatelliteTile ?? ((z, x, y) => defaultFetchSatelliteTile(z, x, y, rasterOptions));
  const fetchDemTile =
    rasterOptions.fetchDemTile ?? ((z, x, y) => defaultFetchDemTile(z, x, y, rasterOptions));
  const renderDemPng =
    rasterOptions.renderDemPng ?? ((gtiffPath, z, x, y) => defaultRenderDemPng(gtiffPath, z, x, y, rasterOptions));

  async function fetchSatelliteTileOnce(z, x, y) {
    const { satellitePath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
    return runWithInFlight(satelliteInFlight, satellitePath, () => fetchSatelliteTile(z, x, y));
  }

  async function fetchDemTileOnce(z, x, y) {
    const { demGtiffPath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
    return runWithInFlight(demInFlight, demGtiffPath, () => fetchDemTile(z, x, y));
  }

  async function renderDemPngOnce(gtiffPath, z, x, y) {
    const { demPngPath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
    return runWithInFlight(demPngInFlight, demPngPath, () => renderDemPng(gtiffPath, z, x, y));
  }

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
      const gtiffResult = await fetchDemTileOnce(z, x, y);
      const gtiffPath = gtiffResult.gtiffPath ?? gtiffResult.path;
      const pngResult = await renderDemPngOnce(gtiffPath, z, x, y);

      res.status(200).json({
        ok: true,
        kind: 'dem',
        gtiffPath,
        gtiffCached: gtiffResult.gtiffCached ?? gtiffResult.cached ?? false,
        pngPath: pngResult.pngPath ?? pngResult.path,
        pngCached: pngResult.pngCached ?? pngResult.cached ?? false
      });
    } catch (_error) {
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
      const gtiffResult = await fetchDemTileOnce(z, x, y);
      const gtiffPath = gtiffResult.gtiffPath ?? gtiffResult.path;
      const pngResult = await renderDemPngOnce(gtiffPath, z, x, y);

      res.status(200).json({
        ok: true,
        kind: 'dem-png',
        path: pngResult.pngPath ?? pngResult.path,
        cached: pngResult.pngCached ?? pngResult.cached ?? false
      });
    } catch (_error) {
      sendRasterError(res, 500, 'DEM_PNG_RENDER_FAILED', 'Internal server error');
    }
  });

  return router;
}