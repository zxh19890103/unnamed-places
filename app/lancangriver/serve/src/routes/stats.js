import { Router } from 'express';
import { readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function getDefaultTilesRoot() {
  const routeDir = dirname(fileURLToPath(import.meta.url));
  return resolve(routeDir, '../../.tiles');
}

async function sumDirectoryBytes(directoryPath) {
  let entries;

  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return 0;
    }

    throw error;
  }

  let total = 0;

  for (const entry of entries) {
    const entryPath = resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      total += await sumDirectoryBytes(entryPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStats = await stat(entryPath);
    total += fileStats.size;
  }

  return total;
}

function createStatsErrorPayload(code, reason) {
  return {
    error: {
      code,
      reason,
    },
  };
}

export function createStatsRouter(options = {}) {
  const statsOptions = options.stats ?? options;
  const tilesRoot = statsOptions.tilesRoot
    ? resolve(statsOptions.tilesRoot)
    : getDefaultTilesRoot();
  const sumTilesBytes = statsOptions.sumTilesBytes ?? sumDirectoryBytes;

  const cache = {
    initialized: false,
    bytes: 0,
    updatedAt: null,
  };
  let inFlight = null;

  async function refreshCache() {
    if (inFlight) {
      return inFlight;
    }

    inFlight = (async () => {
      const bytes = await sumTilesBytes(tilesRoot);
      cache.bytes = bytes;
      cache.updatedAt = new Date().toISOString();
      cache.initialized = true;
      return cache;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  const router = Router();

  router.get('/stats/tiles/bytes', async (_req, res) => {
    const wasInitialized = cache.initialized;

    try {
      if (!wasInitialized) {
        await refreshCache();
      }

      res.status(200).json({
        ok: true,
        tilesRoot,
        bytes: cache.bytes,
        cached: wasInitialized,
        updatedAt: cache.updatedAt,
      });
    } catch (_error) {
      res
        .status(500)
        .json(createStatsErrorPayload('TILES_SIZE_SUM_FAILED', 'Internal server error'));
    }
  });

  router.post('/stats/tiles/bytes/recompute', async (_req, res) => {
    try {
      await refreshCache();

      res.status(200).json({
        ok: true,
        tilesRoot,
        bytes: cache.bytes,
        cached: false,
        updatedAt: cache.updatedAt,
        recomputed: true,
      });
    } catch (_error) {
      res
        .status(500)
        .json(createStatsErrorPayload('TILES_SIZE_RESUM_FAILED', 'Internal server error'));
    }
  });

  return router;
}
