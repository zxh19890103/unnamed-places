import './env.js';
import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { dbQuery, getVectorTilePbf, upsertVectorFeatures } from './db.js';
import { createCenterlineRouter } from './routes/centerline.js';
import { createHealthRouter } from './routes/health.js';
import { createRasterRouter } from './routes/raster.js';
import { createStatsRouter } from './routes/stats.js';
import { createVectorRouter } from './routes/vector.js';
import { createVectorTilesRouter } from './routes/vectorTiles.js';
import { createPhotosRouter } from './routes/photos.js';
import { getCoveringZ12Tiles } from './jobs/tileCoverage.js';
import { createOsmJobsStore } from './jobs/osmJobsStore.js';
import { createOsmIngestRunner, createOsmIngestWorker } from './jobs/osmIngestWorker.js';
import { fetchOsmFeaturesForZ12Key } from './jobs/osmFetch.js';

function createDefaultJobsStore() {
  return createOsmJobsStore({
    db: {
      query: dbQuery
    }
  });
}

function createQueueMissingCoverage(jobsStore) {
  return async function queueMissingCoverage(z, x, y) {
    const covering = getCoveringZ12Tiles(z, x, y);
    const keys = covering.map((tile) => tile.key);
    const statuses = await jobsStore.getStatuses(keys);

    for (const key of keys) {
      if (!statuses[key]) {
        await jobsStore.enqueueIfMissing(key);
      }
    }

    const refreshed = await jobsStore.getStatuses(keys);
    const allReady = keys.every((key) => refreshed[key] === 'done');

    return { allReady };
  };
}

function createDefaultRunner(jobsStore) {
  const worker = createOsmIngestWorker({
    jobs: jobsStore,
    fetchOsmFeatures: fetchOsmFeaturesForZ12Key,
    upsertVectorFeatures
  });

  return createOsmIngestRunner({ worker, intervalMs: 2000 });
}

export function createApp(options = {}) {
  const app = express();
  const jobsStore = options.jobsStore ?? createDefaultJobsStore();
  const queueMissingCoverage = options.queueMissingCoverage ?? createQueueMissingCoverage(jobsStore);
  const tilePbfGetter = options.getVectorTilePbf ?? getVectorTilePbf;

  app.use(cors());
  app.use(createHealthRouter());
  app.use(createCenterlineRouter(options));
  app.use(createRasterRouter(options));
  app.use(createStatsRouter(options));
  app.use(createVectorRouter(options));
  app.use(createVectorTilesRouter({
    queueMissingCoverage,
    getVectorTilePbf: tilePbfGetter
  }));
  app.use(createPhotosRouter(options));

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const { port } = getConfig();
  const jobsStore = createDefaultJobsStore();
  const runner = createDefaultRunner(jobsStore);

  runner.start();

  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`lancangriver service listening on ${port}`);
  });

  const shutdown = () => {
    runner.stop();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
