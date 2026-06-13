import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fromFile } from 'geotiff';
import { PNG } from 'pngjs';

const SATELLITE_TEMPLATE =
  process.env.SATELLITE_URL_TEMPLATE ||
  'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&scale=4';

const OPENTOPOGRAPHY_TEMPLATE =
  process.env.OPENTOPOGRAPHY_URL_TEMPLATE ||
  'https://portal.opentopography.org/API/globaldem?demtype=SRTMGL1&south={south}&north={north}&west={west}&east={east}&outputFormat=GTiff&API_Key={apiKey}';

function parseArgs(argv) {
  const result = {
    minLon: null,
    minLat: null,
    maxLon: null,
    maxLat: null,
    zoom: 11,
    root: resolve('tiles'),
    concurrency: 6,
    skipSatellite: false,
    skipDem: false,
    force: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--bbox') {
      const next = argv[index + 1] || '';
      const parts = next.split(',').map((part) => Number(part.trim()));
      if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
        throw new Error('Invalid --bbox. Expected minLon,minLat,maxLon,maxLat');
      }
      [result.minLon, result.minLat, result.maxLon, result.maxLat] = parts;
      index += 1;
      continue;
    }

    if (token === '--zoom') {
      result.zoom = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === '--root') {
      result.root = resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === '--concurrency') {
      result.concurrency = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === '--skip-satellite') {
      result.skipSatellite = true;
      continue;
    }

    if (token === '--skip-dem') {
      result.skipDem = true;
      continue;
    }

    if (token === '--force') {
      result.force = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!Number.isInteger(result.zoom) || result.zoom < 0) {
    throw new Error('--zoom must be a non-negative integer');
  }

  if (!Number.isInteger(result.concurrency) || result.concurrency < 1) {
    throw new Error('--concurrency must be >= 1');
  }

  const hasBbox =
    Number.isFinite(result.minLon) &&
    Number.isFinite(result.minLat) &&
    Number.isFinite(result.maxLon) &&
    Number.isFinite(result.maxLat);

  if (!hasBbox) {
    throw new Error('Missing --bbox. Expected minLon,minLat,maxLon,maxLat');
  }

  if (result.minLon >= result.maxLon || result.minLat >= result.maxLat) {
    throw new Error('--bbox bounds are invalid (min must be less than max)');
  }

  return result;
}

function printUsage() {
  console.log(`
Prefetch DEM + satellite tiles into tiles/{z}/{x}/{y}/...

Usage:
  npm run prefetch:tiles -- --bbox 99.0,21.0,101.5,23.0 --zoom 11

Options:
  --bbox <minLon,minLat,maxLon,maxLat>   Required target bbox
  --zoom <z>                              Tile zoom level (default: 11)
  --root <dir>                            Tile root directory (default: ./tiles)
  --concurrency <n>                       Concurrent tile workers (default: 6)
  --skip-satellite                        Skip satellite download
  --skip-dem                              Skip DEM download/render
  --force                                 Redownload/rebuild even if cached
`);
}

function tile2lon(x, z) {
  return (x / 2 ** z) * 360 - 180;
}

function tile2lat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function lon2tileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function lat2tileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

function zxyToBbox(z, x, y) {
  const west = tile2lon(x, z);
  const east = tile2lon(x + 1, z);
  const north = tile2lat(y, z);
  const south = tile2lat(y + 1, z);
  return { west, south, east, north };
}

function listTilesForBbox(minLon, minLat, maxLon, maxLat, z) {
  const maxIndex = 2 ** z - 1;

  const minX = Math.max(0, Math.min(maxIndex, lon2tileX(minLon, z)));
  const maxX = Math.max(0, Math.min(maxIndex, lon2tileX(maxLon, z)));
  const minY = Math.max(0, Math.min(maxIndex, lat2tileY(maxLat, z)));
  const maxY = Math.max(0, Math.min(maxIndex, lat2tileY(minLat, z)));

  const tiles = [];
  for (let x = Math.min(minX, maxX); x <= Math.max(minX, maxX); x += 1) {
    for (let y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y += 1) {
      tiles.push({ z, x, y });
    }
  }

  return tiles;
}

function fillTemplate(template, values) {
  return template.replace(/\{([^}]+)\}/g, (_match, key) =>
    values[key] === undefined ? '' : String(values[key])
  );
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function atomicWrite(filePath, content) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, filePath);
}

function tilePaths(root, z, x, y) {
  const folder = join(root, String(z), String(x), String(y));
  return {
    folder,
    satellite: join(folder, 'satellite.jpeg'),
    demGtiff: join(folder, 'dem.gtiff'),
    demPng: join(folder, 'dem.png')
  };
}

async function downloadFile(url, filePath, force) {
  if (!force && (await exists(filePath))) {
    return { path: filePath, cached: true };
  }

  await ensureDir(filePath);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  await atomicWrite(filePath, data);
  return { path: filePath, cached: false };
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

async function renderGtiffToPng(gtiffPath, pngPath, force) {
  if (!force && (await exists(pngPath))) {
    return { path: pngPath, cached: true };
  }

  await ensureDir(pngPath);
  const tiff = await fromFile(gtiffPath);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const [raster] = await image.readRasters({ samples: [0] });
  const pixels = await normalizeRaster(raster);
  const png = new PNG({ width, height });

  for (let i = 0; i < pixels.length; i += 1) {
    const offset = i * 4;
    const value = pixels[i];
    png.data[offset] = value;
    png.data[offset + 1] = value;
    png.data[offset + 2] = value;
    png.data[offset + 3] = 255;
  }

  await atomicWrite(pngPath, PNG.sync.write(png));
  return { path: pngPath, cached: false };
}

async function prefetchOneTile(tile, options, stats) {
  const { z, x, y } = tile;
  const paths = tilePaths(options.root, z, x, y);

  if (!options.skipSatellite) {
    const satelliteUrl = fillTemplate(SATELLITE_TEMPLATE, { z, x, y });
    const satResult = await downloadFile(satelliteUrl, paths.satellite, options.force);
    if (satResult.cached) {
      stats.satelliteCached += 1;
    } else {
      stats.satelliteDownloaded += 1;
    }
  }

  if (!options.skipDem) {
    const apiKey =
      process.env.OPENTOPOGRAPHY_API_KEY || process.env.OPEN_TOPOGRAPHY_API_KEY || '';
    if (!apiKey) {
      throw new Error('Missing OPENTOPOGRAPHY_API_KEY or OPEN_TOPOGRAPHY_API_KEY');
    }

    const bbox = zxyToBbox(z, x, y);
    const demUrl = fillTemplate(OPENTOPOGRAPHY_TEMPLATE, {
      apiKey,
      south: bbox.south,
      north: bbox.north,
      west: bbox.west,
      east: bbox.east
    });

    const gtiffResult = await downloadFile(demUrl, paths.demGtiff, options.force);
    if (gtiffResult.cached) {
      stats.demGtiffCached += 1;
    } else {
      stats.demGtiffDownloaded += 1;
    }

    const pngResult = await renderGtiffToPng(paths.demGtiff, paths.demPng, options.force);
    if (pngResult.cached) {
      stats.demPngCached += 1;
    } else {
      stats.demPngRendered += 1;
    }
  }
}

async function runPool(items, concurrency, worker) {
  let index = 0;

  async function next() {
    if (index >= items.length) {
      return;
    }

    const current = index;
    index += 1;
    await worker(items[current], current);
    await next();
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
}

async function main() {
  const options = parseArgs(process.argv);
  const tiles = listTilesForBbox(
    options.minLon,
    options.minLat,
    options.maxLon,
    options.maxLat,
    options.zoom
  );

  const stats = {
    satelliteDownloaded: 0,
    satelliteCached: 0,
    demGtiffDownloaded: 0,
    demGtiffCached: 0,
    demPngRendered: 0,
    demPngCached: 0,
    failures: 0
  };

  console.log(`[prefetch] root=${options.root}`);
  console.log(`[prefetch] zoom=${options.zoom} tiles=${tiles.length} concurrency=${options.concurrency}`);
  console.log(
    `[prefetch] bbox=${options.minLon},${options.minLat},${options.maxLon},${options.maxLat}`
  );

  await runPool(tiles, options.concurrency, async (tile, idx) => {
    try {
      await prefetchOneTile(tile, options, stats);
      if ((idx + 1) % 25 === 0 || idx + 1 === tiles.length) {
        console.log(`[prefetch] progress ${idx + 1}/${tiles.length}`);
      }
    } catch (error) {
      stats.failures += 1;
      console.error(
        `[prefetch] failed z=${tile.z} x=${tile.x} y=${tile.y}: ${error && error.message ? error.message : error}`
      );
    }
  });

  console.log('\n[prefetch] done');
  console.log(
    `[prefetch] satellite downloaded=${stats.satelliteDownloaded} cached=${stats.satelliteCached}`
  );
  console.log(
    `[prefetch] dem.gtiff downloaded=${stats.demGtiffDownloaded} cached=${stats.demGtiffCached}`
  );
  console.log(`[prefetch] dem.png rendered=${stats.demPngRendered} cached=${stats.demPngCached}`);
  console.log(`[prefetch] failures=${stats.failures}`);

  if (stats.failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
