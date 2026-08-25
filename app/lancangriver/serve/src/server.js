import './env.js';
import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import {
  dbQuery,
  getVectorTilePbf,
  getVectorTilePbfHighways,
  upsertVectorFeatures,
  upsertVectorFeaturesHighways,
} from './db.js';
import { createCenterlineRouter } from './routes/centerline.js';
import { createCesiumRouter } from './routes/cesium.js';
import { createHealthRouter } from './routes/health.js';
import { createNominatimRouter } from './routes/nominatim.js';
import { createRasterRouter } from './routes/raster.js';
import { createStatsRouter } from './routes/stats.js';
import { createVectorRouter } from './routes/vector.js';
import { createVectorTilesRouter } from './routes/vectorTiles.js';
import { createZ12GeoInfoRouter } from './routes/z12GeoInfo.js';
import { createPhotosRouter } from './routes/photos.js';
import { getCoveringZ12Tiles } from './jobs/tileCoverage.js';
import { createOsmJobsStore } from './jobs/osmJobsStore.js';
import { createOsmHighwayJobsStore } from './jobs/osmHighwayJobsStore.js';
import { createZ12GeoInfoStore } from './jobs/z12GeoInfoStore.js';
import {
  createOsmHighwayIngestWorker,
  createVectorIngestRunner,
  createVectorIngestWorker,
} from './jobs/osmIngestWorker.js';
import { fetchOsmHighwayFeaturesForZ12Key } from './jobs/osmFetch.js';
import { getVectorIngestSource } from './jobs/vectorSourceConfig.js';
import { createVectorFeatureFetcher } from './jobs/vectorSourceRegistry.js';

function createDefaultJobsStore() {
  return createOsmJobsStore({
    db: {
      query: dbQuery,
    },
  });
}

function createHighwayJobsStore() {
  return createOsmHighwayJobsStore({
    db: {
      query: dbQuery,
    },
  });
}

function createDefaultZ12GeoInfoStore() {
  return createZ12GeoInfoStore({
    db: {
      query: dbQuery,
    },
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
  const source = getVectorIngestSource();
  const fetchFeaturesForZ12Key = createVectorFeatureFetcher(source);

  const worker = createVectorIngestWorker({
    jobs: jobsStore,
    fetchFeaturesForZ12Key,
    source,
    upsertVectorFeatures,
  });

  return createVectorIngestRunner({ worker, intervalMs: 2000 });
}

function createHighwayRunner(jobsStore) {
  const worker = createOsmHighwayIngestWorker({
    jobs: jobsStore,
    fetchOsmHighwayFeatures: fetchOsmHighwayFeaturesForZ12Key,
    upsertVectorFeaturesHighways,
  });

  return createVectorIngestRunner({ worker, intervalMs: 2000 });
}

export function createApp(options = {}) {
  const app = express();
  const jobsStore = options.jobsStore ?? createDefaultJobsStore();
  const highwayJobsStore = options.highwayJobsStore ?? createHighwayJobsStore();
  const z12GeoInfoStore = options.z12GeoInfoStore ?? createDefaultZ12GeoInfoStore();
  const queueMissingCoverage =
    options.queueMissingCoverage ?? createQueueMissingCoverage(jobsStore);
  const queueMissingCoverageHighways =
    options.queueMissingCoverageHighways ?? createQueueMissingCoverage(highwayJobsStore);
  const tilePbfGetter = options.getVectorTilePbf ?? getVectorTilePbf;
  const highwayTilePbfGetter = options.getVectorTilePbfHighways ?? getVectorTilePbfHighways;

  app.use(cors());
  app.use(createHealthRouter());
  app.use(createCenterlineRouter(options));
  app.use(createCesiumRouter(options));
  app.use(createNominatimRouter(options));
  app.use(createZ12GeoInfoRouter({ z12GeoInfoStore }));
  app.use(createRasterRouter(options));
  app.use(createStatsRouter(options));
  app.use(createVectorRouter(options));
  app.use(
    createVectorTilesRouter({
      routePrefix: '/vector',
      queueMissingCoverage,
      enqueueCoverageJob: (key) => jobsStore.enqueueIfMissing(key),
      getVectorTilePbf: tilePbfGetter,
      getCoverageStatus: (key) => jobsStore.getStatus(key),
      listLoadedCoverage: (pagination) => jobsStore.listLoaded(pagination),
      listCoverageJobs: (pagination) => jobsStore.listJobs(pagination),
      rerunFailedCoverage: (key) => jobsStore.rerunFailed(key),
    }),
  );
  app.use(
    createVectorTilesRouter({
      routePrefix: '/vector/highways',
      queueMissingCoverage: queueMissingCoverageHighways,
      enqueueCoverageJob: (key) => highwayJobsStore.enqueueIfMissing(key),
      getVectorTilePbf: highwayTilePbfGetter,
      getCoverageStatus: (key) => highwayJobsStore.getStatus(key),
      listLoadedCoverage: (pagination) => highwayJobsStore.listLoaded(pagination),
      listCoverageJobs: (pagination) => highwayJobsStore.listJobs(pagination),
      rerunFailedCoverage: (key) => highwayJobsStore.rerunFailed(key),
    }),
  );
  app.use(createPhotosRouter(options));

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const { port } = getConfig();
  const jobsStore = createDefaultJobsStore();
  const highwayJobsStore = createHighwayJobsStore();
  const runner = createDefaultRunner(jobsStore);
  const highwayRunner = createHighwayRunner(highwayJobsStore);

  runner.start();
  highwayRunner.start();

  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`lancangriver service listening on ${port}`);
  });

  const shutdown = () => {
    runner.stop();
    highwayRunner.stop();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
