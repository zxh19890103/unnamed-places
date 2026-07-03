import fs from 'node:fs';
import { Router } from 'express';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const DEFAULT_SATELLITE_URL_TEMPLATE = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&scale=4';
const DEFAULT_DEM_PNG_URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const MAX_DEM_ZOOM = 15;
const DEM_TILE_SIZE = 256;

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

function parseExtent(value, fallback = 1) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 ? parsed : null;
}

function parseScale(value, fallback = 1) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);

  if (parsed <= 1) return 1;
  return Math.min(parsed, 8);
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
    demPngPath: join(tileRoot, 'dem.png'),
    demAltitudePath: join(tileRoot, 'dem.altitude.json')
  };
}

function buildDemComposePath(composedRoot, z, x, y, extent, scale = 1) {
  return resolve(
    composedRoot,
    'dem',
    String(z),
    String(x),
    String(y),
    `e${extent}-s${scale}.png`
  );
}

function buildNeighborTiles(z, centerX, centerY, extent) {
  const n = 2 ** z;
  const size = extent + 2;
  const tiles = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const dx = col - extent;
      const dy = row - extent;
      const rawX = centerX + dx;
      const rawY = centerY + dy;
      const wrappedX = ((rawX % n) + n) % n;
      const clampedY = Math.max(0, Math.min(n - 1, rawY));

      tiles.push({
        x: wrappedX,
        y: clampedY,
        row,
        col
      });
    }
  }

  return { size, tiles };
}

async function createTransparentTilePng() {
  return sharp({
    create: {
      width: DEM_TILE_SIZE,
      height: DEM_TILE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .png()
    .toBuffer();
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

async function defaultFetchDemPngTile(z, x, y, rasterOptions) {
  const { rasterRoot, fetchImpl, demPngUrlTemplate } = rasterOptions;
  const { demPngPath } = buildRasterPaths(rasterRoot, z, x, y);
  const url = templateUrl(demPngUrlTemplate, { z, x, y });

  return downloadToFile(url, demPngPath, fetchImpl);
}

const satelliteInFlight = createInFlightMap();
const demPngInFlight = createInFlightMap();
const demComposeInFlight = createInFlightMap();
const derivativesInFlight = createInFlightMap();

function createRasterHandlerOptions(options = {}) {
  const rasterOptions = options.raster ?? options;
  const rasterRoot = rasterOptions.rasterRoot ? resolve(rasterOptions.rasterRoot) : resolve('.tiles');

  return {
    rasterRoot,
    projRoot: resolve(rasterRoot, '../'),
    composedRoot: resolve(rasterRoot, '../.composed'),
    satelliteUrlTemplate: rasterOptions.satelliteUrlTemplate ?? DEFAULT_SATELLITE_URL_TEMPLATE,
    demPngUrlTemplate: rasterOptions.demPngUrlTemplate ?? DEFAULT_DEM_PNG_URL_TEMPLATE,
    fetchImpl: rasterOptions.fetchImpl ?? fetch,
    fetchSatelliteTile: rasterOptions.fetchSatelliteTile,
    fetchDemPngTile: rasterOptions.fetchDemPngTile,
    composeDemNeighborhood: rasterOptions.composeDemNeighborhood
  };
}

function sendRasterError(res, status, code, reason, runtimeError = null) {
  if (runtimeError) {
    console.log('[SendRasterError]', runtimeError);
  }

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

async function readDemAltitudeFromPng(pngPath) {
  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const elevation = (r * 256.0 + g + b / 256.0) - 32768.0;

    if (elevation < min) {
      min = elevation;
    }

    if (elevation > max) {
      max = elevation;
    }

    sum += elevation;
    count += 1;
  }

  return {
    min,
    max,
    avg: count > 0 ? sum / count : 0
  };
}

function computeSlopeAspect(demData, width, height) {
  // Compute slope and aspect from DEM data (Terrarium format: elevation = R*256 + G + B/256 - 32768)
  // Returns Uint8Array of RGBA derivatives

  const output = new Uint8Array(width * height * 4);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      // Helper to extract elevation from Terrarium-encoded pixel
      const getElevation = (px, py) => {
        const pidx = (py * width + px) * 4;
        const r = demData[pidx];
        const g = demData[pidx + 1];
        const b = demData[pidx + 2];
        return (r * 256 + g + b / 256) - 32768;
      };

      // Read 3x3 neighborhood
      const z00 = getElevation(x - 1, y - 1);
      const z10 = getElevation(x, y - 1);
      const z20 = getElevation(x + 1, y - 1);
      const z01 = getElevation(x - 1, y);
      const z21 = getElevation(x + 1, y);
      const z02 = getElevation(x - 1, y + 1);
      const z12 = getElevation(x, y + 1);
      const z22 = getElevation(x + 1, y + 1);

      // Horn-style derivatives
      const dz_dx = (-z00 - 2 * z01 - z02 + z20 + 2 * z21 + z22) / 8.0;
      const dz_dy = (-z00 - 2 * z10 - z20 + z02 + 2 * z12 + z22) / 8.0;

      // Slope in degrees
      const slope = Math.atan(Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy)) * (180 / Math.PI);

      // Aspect in radians [0, 2π)
      let aspect = Math.atan2(dz_dy, dz_dx);
      if (aspect < 0) aspect += 2 * Math.PI;

      // Pack to RGBA
      output[idx] = Math.round(Math.max(0, Math.min(255, (slope / 90) * 255)));       // R = slope
      output[idx + 1] = Math.round((Math.sin(aspect) * 0.5 + 0.5) * 255);              // G = sin(aspect)
      output[idx + 2] = Math.round((Math.cos(aspect) * 0.5 + 0.5) * 255);              // B = cos(aspect)
      output[idx + 3] = 255;                                                             // A = 255
    }
  }

  // Handle border by replicating edge pixels
  // Top/bottom rows
  for (let x = 0; x < width; x++) {
    const srcIdx = (1 * width + x) * 4;
    const topIdx = (0 * width + x) * 4;
    output.set(output.subarray(srcIdx, srcIdx + 4), topIdx);

    const srcBotIdx = ((height - 2) * width + x) * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    output.set(output.subarray(srcBotIdx, srcBotIdx + 4), botIdx);
  }

  // Left/right columns
  for (let y = 0; y < height; y++) {
    const srcIdx = (y * width + 1) * 4;
    const leftIdx = (y * width + 0) * 4;
    output.set(output.subarray(srcIdx, srcIdx + 4), leftIdx);

    const srcRIdx = (y * width + (width - 2)) * 4;
    const rIdx = (y * width + (width - 1)) * 4;
    output.set(output.subarray(srcRIdx, srcRIdx + 4), rIdx);
  }

  return output;
}

async function ensureDemAltitudeMetadata(rasterOptions, z, x, y, fetchDemPngTileOnce) {
  const { demPngPath, demAltitudePath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);

  if (await isExistingPath(demAltitudePath)) {
    const cached = await readFile(demAltitudePath, 'utf8');
    return { path: demAltitudePath, cached: true, ...JSON.parse(cached) };
  }

  if (!(await isExistingPath(demPngPath))) {
    await fetchDemPngTileOnce(z, x, y);
  }

  const altitude = await readDemAltitudeFromPng(demPngPath);
  await ensureDirectory(demAltitudePath);
  await writeAtomicFile(demAltitudePath, `${JSON.stringify(altitude)}\n`);

  return { path: demAltitudePath, cached: false, ...altitude };
}

export function createRasterRouter(options = {}) {
  const rasterOptions = createRasterHandlerOptions(options);
  const router = Router();

  const fetchSatelliteTile =
    rasterOptions.fetchSatelliteTile ?? ((z, x, y) => defaultFetchSatelliteTile(z, x, y, rasterOptions));
  const fetchDemPngTile =
    rasterOptions.fetchDemPngTile ?? ((z, x, y) => defaultFetchDemPngTile(z, x, y, rasterOptions));

  const composeDemNeighborhood =
    rasterOptions.composeDemNeighborhood ??
    (async (z, x, y, extent, scale = 1) => {
      const outputPath = buildDemComposePath(rasterOptions.composedRoot, z, x, y, extent, scale);

      if (await isExistingPath(outputPath)) {
        return { outputPath, cached: true };
      }

      const { size, tiles } = buildNeighborTiles(z, x, y, extent);
      const transparentTile = await createTransparentTilePng();
      const inputs = [];

      for (const tile of tiles) {
        const left = tile.col * DEM_TILE_SIZE;
        const top = tile.row * DEM_TILE_SIZE;

        try {
          const tileResult = await fetchDemPngTileOnce(z, tile.x, tile.y);
          const tilePath = tileResult.pngPath ?? tileResult.path;
          inputs.push({ input: tilePath, left, top });
        } catch {
          inputs.push({ input: transparentTile, left, top });
        }
      }

      await ensureDirectory(outputPath);

      const outputWidth = Math.max(1, Math.floor((size * DEM_TILE_SIZE) / scale));
      const outputHeight = Math.max(1, Math.floor((size * DEM_TILE_SIZE) / scale));

      const pipeline = sharp({
        create: {
          width: size * DEM_TILE_SIZE,
          height: size * DEM_TILE_SIZE,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite(inputs)
        .resize(outputWidth, outputHeight, {
          fit: 'fill',
          kernel: sharp.kernel.lanczos3
        })
        .png();

      await pipeline.toFile(outputPath);

      return { outputPath, cached: false };
    });

  async function fetchSatelliteTileOnce(z, x, y) {
    const { satellitePath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
    return runWithInFlight(satelliteInFlight, satellitePath, () => fetchSatelliteTile(z, x, y));
  }

  async function fetchDemPngTileOnce(z, x, y) {
    const { demPngPath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
    return runWithInFlight(demPngInFlight, demPngPath, () => fetchDemPngTile(z, x, y));
  }

  async function composeDemNeighborhoodOnce(z, x, y, extent, scale = 1) {
    const outputPath = buildDemComposePath(rasterOptions.composedRoot, z, x, y, extent, scale);

    if (await isExistingPath(outputPath)) {
      return { outputPath, cached: true };
    }

    return runWithInFlight(demComposeInFlight, outputPath, async () => {
      if (await isExistingPath(outputPath)) {
        return { outputPath, cached: true };
      }

      const result = await composeDemNeighborhood(z, x, y, extent, scale);

      return {
        outputPath: result.outputPath ?? result.path ?? outputPath,
        cached: result.cached ?? false
      };
    });
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
      sendRasterError(res, 500, 'SATELLITE_TILE_STREAM_FAILED', 'Internal server error', _error);
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

    if (z > MAX_DEM_ZOOM) {
      sendRasterError(res, 400, 'DEM_ZOOM_TOO_HIGH', 'DEM tiles only support zoom levels up to 15');
      return;
    }

    try {
      const pngResult = await fetchDemPngTileOnce(z, x, y);
      const pngPath = pngResult.pngPath ?? pngResult.path;
      await sendRasterFile(res, pngPath, 'image/png');
    } catch (error) {
      sendRasterError(res, 500, 'DEM_PNG_STREAM_FAILED', 'Internal server error');
    }
  });

  router.get('/raster/dem/:z/:x/:y/altitude', async (req, res) => {
    const z = parseTileCoordinate(req.params.z);
    const x = parseTileCoordinate(req.params.x);
    const y = parseTileCoordinate(req.params.y);

    if (!validateTileCoordinates(z, x, y)) {
      sendRasterError(res, 400, 'INVALID_TILE_COORDINATES', 'Invalid z/x/y tile coordinates');
      return;
    }

    if (z > MAX_DEM_ZOOM) {
      sendRasterError(res, 400, 'DEM_ZOOM_TOO_HIGH', 'DEM tiles only support zoom levels up to 15');
      return;
    }

    try {
      const altitudeResult = await ensureDemAltitudeMetadata(
        rasterOptions,
        z,
        x,
        y,
        fetchDemPngTileOnce,
      );

      res.status(200).json({
        ok: true,
        kind: 'dem-altitude',
        path: altitudeResult.path,
        cached: altitudeResult.cached,
        min: altitudeResult.min,
        max: altitudeResult.max,
        avg: altitudeResult.avg
      });
    } catch (_error) {
      sendRasterError(res, 500, 'DEM_ALTITUDE_FAILED', 'Internal server error', _error);
    }
  });

  router.get('/raster/dem/:z/:x/:y/compose.png', async (req, res) => {
    const z = parseTileCoordinate(req.params.z);
    const x = parseTileCoordinate(req.params.x);
    const y = parseTileCoordinate(req.params.y);

    const extent = parseExtent(req.query.extent, 1);
    const scale = parseScale(req.query.scale, 1);

    if (!validateTileCoordinates(z, x, y)) {
      sendRasterError(res, 400, 'INVALID_TILE_COORDINATES', 'Invalid z/x/y tile coordinates');
      return;
    }

    if (z > MAX_DEM_ZOOM) {
      sendRasterError(res, 400, 'DEM_ZOOM_TOO_HIGH', 'DEM tiles only support zoom levels up to 15');
      return;
    }

    if (extent === null) {
      sendRasterError(res, 400, 'INVALID_EXTENT', 'extent must be an integer >= 1');
      return;
    }

    try {
      const composeResult = await composeDemNeighborhoodOnce(z, x, y, extent, scale);
      await sendRasterFile(res, composeResult.outputPath, 'image/png');
    } catch (_error) {
      sendRasterError(res, 500, 'DEM_COMPOSE_STREAM_FAILED', 'Internal server error');
    }
  });

  //#region fetch images and save, then returns info
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

    if (z > MAX_DEM_ZOOM) {
      sendRasterError(res, 400, 'DEM_ZOOM_TOO_HIGH', 'DEM tiles only support zoom levels up to 15');
      return;
    }

    try {
      const pngResult = await fetchDemPngTileOnce(z, x, y);

      res.status(200).json({
        ok: true,
        kind: 'dem',
        pngPath: pngResult.pngPath ?? pngResult.path,
        pngCached: pngResult.pngCached ?? pngResult.cached ?? true
      });
    } catch (error) {
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

    if (z > MAX_DEM_ZOOM) {
      sendRasterError(res, 400, 'DEM_ZOOM_TOO_HIGH', 'DEM tiles only support zoom levels up to 15');
      return;
    }

    try {
      const pngResult = await fetchDemPngTileOnce(z, x, y);

      res.status(200).json({
        ok: true,
        kind: 'dem-png',
        path: pngResult.pngPath ?? pngResult.path,
        cached: pngResult.pngCached ?? pngResult.cached ?? true
      });
    } catch (error) {
      sendRasterError(res, 500, 'DEM_PNG_RENDER_FAILED', 'Internal server error');
    }
  });
  //#endregion

  // Derivatives route: computes and caches slope/aspect derivatives
  router.get('/raster/dem/:z/:x/:y/derivatives.png', async (req, res) => {
    const z = parseTileCoordinate(req.params.z);
    const x = parseTileCoordinate(req.params.x);
    const y = parseTileCoordinate(req.params.y);

    if (!validateTileCoordinates(z, x, y)) {
      sendRasterError(res, 400, 'INVALID_TILE_COORDINATES', 'Invalid z/x/y tile coordinates');
      return;
    }

    if (z > MAX_DEM_ZOOM) {
      sendRasterError(res, 400, 'DEM_ZOOM_TOO_HIGH', 'Derivatives only support zoom levels up to 15');
      return;
    }

    try {
      const cacheKey = `${z}/${x}/${y}`;

      // Use in-flight map to avoid duplicate concurrent computations
      const result = await runWithInFlight(derivativesInFlight, cacheKey, async () => {
        const { demPngPath } = buildRasterPaths(rasterOptions.rasterRoot, z, x, y);
        const tileRoot = dirname(demPngPath);
        const derivativesPath = join(tileRoot, 'derivatives.png');

        // Check cache first
        if (await isExistingPath(derivativesPath)) {
          return { path: derivativesPath, cached: true };
        }

        // Ensure DEM tile exists
        if (!(await isExistingPath(demPngPath))) {
          await fetchDemPngTileOnce(z, x, y);
        }

        // Read DEM PNG and decode
        const demBuffer = await readFile(demPngPath);
        const png = new PNG();

        return new Promise((resolve, reject) => {
          png.parse(demBuffer, async (err, parsedPng) => {
            if (err) {
              console.error(`Failed to parse DEM PNG for ${z}/${x}/${y}:`, err);
              reject(new Error('DEM parse failed'));
              return;
            }

            try {
              const width = parsedPng.width;
              const height = parsedPng.height;
              const derivativesData = computeSlopeAspect(parsedPng.data, width, height);

              // Create derivatives PNG
              const derivativesPng = new PNG({ width, height });
              derivativesPng.data = Buffer.from(derivativesData);

              // Write atomically
              await ensureDirectory(derivativesPath);

              const tmpPath = `${derivativesPath}.${process.pid}.${Date.now()}.tmp`;
              const writeStream = fs.createWriteStream(tmpPath);

              derivativesPng.pack().pipe(writeStream);

              writeStream.on('finish', async () => {
                try {
                  await rename(tmpPath, derivativesPath);
                  resolve({ path: derivativesPath, cached: false });
                } catch (renameErr) {
                  console.error(`Failed to rename derivatives temp file:`, renameErr);
                  reject(renameErr);
                }
              });

              writeStream.on('error', (writeErr) => {
                console.error(`Failed to write derivatives PNG:`, writeErr);
                reject(writeErr);
              });
            } catch (processErr) {
              console.error(`Failed to process derivatives:`, processErr);
              reject(processErr);
            }
          });
        });
      });

      await sendRasterFile(res, result.path, 'image/png');
    } catch (error) {
      sendRasterError(res, 500, 'DERIVATIVES_COMPUTE_FAILED', 'Internal server error', error);
    }
  });

  return router;
}
