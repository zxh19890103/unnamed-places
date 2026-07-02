import { Router } from 'express';

function parsePositiveInteger(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    return null;
  }

  return num;
}

export function createVectorTilesRouter(options = {}) {
  const queueMissingCoverage = options.queueMissingCoverage;
  const getVectorTilePbf = options.getVectorTilePbf;

  if (typeof queueMissingCoverage !== 'function') {
    throw new Error('queueMissingCoverage is required');
  }

  if (typeof getVectorTilePbf !== 'function') {
    throw new Error('getVectorTilePbf is required');
  }

  const router = Router();

  router.get('/vector/tiles/:z/:x/:y.pbf', async (req, res) => {
    const z = parsePositiveInteger(req.params.z);
    const x = parsePositiveInteger(req.params.x);
    const y = parsePositiveInteger(req.params.y);

    if (z === null || x === null || y === null) {
      res.status(400).json({
        error: {
          code: 'INVALID_TILE_COORDS',
          reason: 'Tile coordinates must be non-negative integers'
        }
      });
      return;
    }

    const state = await queueMissingCoverage(z, x, y);
    if (!state.allReady) {
      res.status(204).end();
      return;
    }

    const pbf = await getVectorTilePbf(z, x, y);

    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).send(pbf ?? Buffer.alloc(0));
  });

  return router;
}
