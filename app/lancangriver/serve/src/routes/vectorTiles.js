import { Router } from 'express';

function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    return null;
  }

  return num;
}

export function createVectorTilesRouter(options = {}) {
  const queueMissingCoverage = options.queueMissingCoverage;
  const getVectorTilePbf = options.getVectorTilePbf;
  const getCoverageStatus = options.getCoverageStatus;
  const listLoadedCoverage = options.listLoadedCoverage;
  const listCoverageJobs = options.listCoverageJobs;
  const rerunFailedCoverage = options.rerunFailedCoverage;

  if (typeof queueMissingCoverage !== 'function') {
    throw new Error('queueMissingCoverage is required');
  }

  if (typeof getVectorTilePbf !== 'function') {
    throw new Error('getVectorTilePbf is required');
  }

  if (typeof getCoverageStatus !== 'function') {
    throw new Error('getCoverageStatus is required');
  }

  if (typeof listLoadedCoverage !== 'function') {
    throw new Error('listLoadedCoverage is required');
  }

  if (typeof listCoverageJobs !== 'function') {
    throw new Error('listCoverageJobs is required');
  }

  if (typeof rerunFailedCoverage !== 'function') {
    throw new Error('rerunFailedCoverage is required');
  }

  const router = Router();

  router.get('/vector/coverage/loaded', async (req, res) => {
    const limit = req.query.limit === undefined ? 100 : parsePositiveInteger(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : parsePositiveInteger(req.query.offset);

    if (limit === null || limit < 1 || limit > 1000 || offset === null) {
      res.status(400).json({
        error: {
          code: 'INVALID_PAGINATION',
          reason: 'limit must be between 1 and 1000 and offset must be a non-negative integer'
        }
      });
      return;
    }

    const { keys, total } = await listLoadedCoverage({ limit, offset });
    const tiles = keys.map((key) => {
      const [z, x, y] = key.split('/').map(Number);
      return { key, z, x, y };
    });

    res.status(200).json({ tiles, limit, offset, total });
  });

  router.get('/vector/coverage/jobs', async (req, res) => {
    const limit = req.query.limit === undefined ? 100 : parsePositiveInteger(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : parsePositiveInteger(req.query.offset);

    if (limit === null || limit < 1 || limit > 1000 || offset === null) {
      res.status(400).json({
        error: {
          code: 'INVALID_PAGINATION',
          reason: 'limit must be between 1 and 1000 and offset must be a non-negative integer'
        }
      });
      return;
    }

    const { jobs, total } = await listCoverageJobs({ limit, offset });
    const parsedJobs = jobs.map(({ key, status }) => {
      const [z, x, y] = key.split('/').map(Number);
      return { key, z, x, y, status };
    });

    res.status(200).json({ jobs: parsedJobs, limit, offset, total });
  });

  router.post('/vector/coverage/12/:x/:y/rerun', async (req, res) => {
    const x = parsePositiveInteger(req.params.x);
    const y = parsePositiveInteger(req.params.y);

    if (x === null || y === null) {
      res.status(400).json({
        error: {
          code: 'INVALID_TILE_COORDS',
          reason: 'Tile coordinates must be non-negative integers'
        }
      });
      return;
    }

    const key = `12/${x}/${y}`;
    const result = await rerunFailedCoverage(key);

    if (result === 'not_found') {
      res.status(404).json({
        error: {
          code: 'COVERAGE_JOB_NOT_FOUND',
          reason: 'Coverage job does not exist'
        }
      });
      return;
    }

    if (result === 'not_failed') {
      res.status(409).json({
        error: {
          code: 'COVERAGE_JOB_NOT_FAILED',
          reason: 'Only failed coverage jobs can be rerun'
        }
      });
      return;
    }

    res.status(200).json({ key, status: 'queued' });
  });

  router.get('/vector/coverage/12/:x/:y', async (req, res) => {
    const x = parsePositiveInteger(req.params.x);
    const y = parsePositiveInteger(req.params.y);

    if (x === null || y === null) {
      res.status(400).json({
        error: {
          code: 'INVALID_TILE_COORDS',
          reason: 'Tile coordinates must be non-negative integers'
        }
      });
      return;
    }

    const key = `12/${x}/${y}`;
    const status = await getCoverageStatus(key);

    res.status(200).json({ key, status, loaded: status === 'done' });
  });

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
