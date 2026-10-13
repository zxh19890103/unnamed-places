import './env.js';
import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import {
  dbQuery,
  getVectorTilePbf,
  getVectorTilePbfHighways,
  getVectorTilePbfNaturalWater,
  getVectorTilePbfPlaces,
  getVectorTilePbfWaters,
  upsertVectorFeatures,
  upsertVectorFeaturesHighways,
  upsertVectorFeaturesNaturalWater,
  upsertVectorFeaturesPlaces,
  upsertVectorFeaturesWaters,
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
import { createOsmNaturalWaterJobsStore } from './jobs/osmNaturalWaterJobsStore.js';
import { createOsmPlacesJobsStore } from './jobs/osmPlacesJobsStore.js';
import { createOsmWatersJobsStore } from './jobs/osmWatersJobsStore.js';
import { createZ12GeoInfoStore } from './jobs/z12GeoInfoStore.js';
import {
  createOsmHighwayIngestWorker,
  createOsmNaturalWaterIngestWorker,
  createOsmPlaceIngestWorker,
  createOsmWaterIngestWorker,
  createVectorIngestRunner,
  createVectorIngestWorker,
} from './jobs/osmIngestWorker.js';
import {
  fetchOsmHighwayFeaturesForZ12Key,
  fetchOsmNaturalWaterFeaturesForZ12Key,
  fetchOsmPlaceFeaturesForZ12Key,
  fetchOsmWaterFeaturesForZ12Key,
} from './jobs/osmFetch.js';
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

function createWatersJobsStore() {
  return createOsmWatersJobsStore({
    db: {
      query: dbQuery,
    },
  });
}

function createPlacesJobsStore() {
  return createOsmPlacesJobsStore({
    db: {
      query: dbQuery,
    },
  });
}

function createNaturalWaterJobsStore() {
  return createOsmNaturalWaterJobsStore({
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

function createWaterRunner(jobsStore) {
  const worker = createOsmWaterIngestWorker({
    jobs: jobsStore,
    fetchOsmWaterFeatures: fetchOsmWaterFeaturesForZ12Key,
    upsertVectorFeaturesWaters,
  });

  return createVectorIngestRunner({ worker, intervalMs: 2000 });
}

function createPlaceRunner(jobsStore) {
  const worker = createOsmPlaceIngestWorker({
    jobs: jobsStore,
    fetchOsmPlaceFeatures: fetchOsmPlaceFeaturesForZ12Key,
    upsertVectorFeaturesPlaces,
  });

  return createVectorIngestRunner({ worker, intervalMs: 2000 });
}

function createNaturalWaterRunner(jobsStore) {
  const worker = createOsmNaturalWaterIngestWorker({
    jobs: jobsStore,
    fetchOsmNaturalWaterFeatures: fetchOsmNaturalWaterFeaturesForZ12Key,
    upsertVectorFeaturesNaturalWater,
  });

  return createVectorIngestRunner({ worker, intervalMs: 2000 });
}

export function createApp(options = {}) {
  const app = express();
  const jobsStore = options.jobsStore ?? createDefaultJobsStore();
  const highwayJobsStore = options.highwayJobsStore ?? createHighwayJobsStore();
  const watersJobsStore = options.watersJobsStore ?? createWatersJobsStore();
  const placesJobsStore = options.placesJobsStore ?? createPlacesJobsStore();
  const naturalWaterJobsStore = options.naturalWaterJobsStore ?? createNaturalWaterJobsStore();
  const z12GeoInfoStore = options.z12GeoInfoStore ?? createDefaultZ12GeoInfoStore();
  const queueMissingCoverage =
    options.queueMissingCoverage ?? createQueueMissingCoverage(jobsStore);
  const queueMissingCoverageHighways =
    options.queueMissingCoverageHighways ?? createQueueMissingCoverage(highwayJobsStore);
  const queueMissingCoverageWaters =
    options.queueMissingCoverageWaters ?? createQueueMissingCoverage(watersJobsStore);
  const queueMissingCoveragePlaces =
    options.queueMissingCoveragePlaces ?? createQueueMissingCoverage(placesJobsStore);
  const queueMissingCoverageNaturalWater =
    options.queueMissingCoverageNaturalWater ?? createQueueMissingCoverage(naturalWaterJobsStore);
  const tilePbfGetter = options.getVectorTilePbf ?? getVectorTilePbf;
  const highwayTilePbfGetter = options.getVectorTilePbfHighways ?? getVectorTilePbfHighways;
  const watersTilePbfGetter = options.getVectorTilePbfWaters ?? getVectorTilePbfWaters;
  const placesTilePbfGetter = options.getVectorTilePbfPlaces ?? getVectorTilePbfPlaces;
  const naturalWaterTilePbfGetter =
    options.getVectorTilePbfNaturalWater ?? getVectorTilePbfNaturalWater;

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
  app.use(
    createVectorTilesRouter({
      routePrefix: '/vector/waters',
      queueMissingCoverage: queueMissingCoverageWaters,
      enqueueCoverageJob: (key) => watersJobsStore.enqueueIfMissing(key),
      getVectorTilePbf: watersTilePbfGetter,
      getCoverageStatus: (key) => watersJobsStore.getStatus(key),
      listLoadedCoverage: (pagination) => watersJobsStore.listLoaded(pagination),
      listCoverageJobs: (pagination) => watersJobsStore.listJobs(pagination),
      rerunFailedCoverage: (key) => watersJobsStore.rerunFailed(key),
    }),
  );
  app.use(
    createVectorTilesRouter({
      routePrefix: '/vector/places',
      queueMissingCoverage: queueMissingCoveragePlaces,
      enqueueCoverageJob: (key) => placesJobsStore.enqueueIfMissing(key),
      getVectorTilePbf: placesTilePbfGetter,
      getCoverageStatus: (key) => placesJobsStore.getStatus(key),
      listLoadedCoverage: (pagination) => placesJobsStore.listLoaded(pagination),
      listCoverageJobs: (pagination) => placesJobsStore.listJobs(pagination),
      rerunFailedCoverage: (key) => placesJobsStore.rerunFailed(key),
    }),
  );
  app.use(
    createVectorTilesRouter({
      routePrefix: '/vector/natural_water',
      queueMissingCoverage: queueMissingCoverageNaturalWater,
      enqueueCoverageJob: (key) => naturalWaterJobsStore.enqueueIfMissing(key),
      getVectorTilePbf: naturalWaterTilePbfGetter,
      getCoverageStatus: (key) => naturalWaterJobsStore.getStatus(key),
      listLoadedCoverage: (pagination) => naturalWaterJobsStore.listLoaded(pagination),
      listCoverageJobs: (pagination) => naturalWaterJobsStore.listJobs(pagination),
      rerunFailedCoverage: (key) => naturalWaterJobsStore.rerunFailed(key),
    }),
  );
  app.use(createPhotosRouter(options));

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const { port } = getConfig();
  const jobsStore = createDefaultJobsStore();
  const highwayJobsStore = createHighwayJobsStore();
  const watersJobsStore = createWatersJobsStore();
  const placesJobsStore = createPlacesJobsStore();
  const naturalWaterJobsStore = createNaturalWaterJobsStore();
  const runner = createDefaultRunner(jobsStore);
  const highwayRunner = createHighwayRunner(highwayJobsStore);
  const watersRunner = createWaterRunner(watersJobsStore);
  const placeRunner = createPlaceRunner(placesJobsStore);
  const naturalWaterRunner = createNaturalWaterRunner(naturalWaterJobsStore);

  runner.start();
  highwayRunner.start();
  watersRunner.start();
  placeRunner.start();
  naturalWaterRunner.start();

  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`lancangriver service listening on ${port}`);
  });

  const shutdown = () => {
    runner.stop();
    highwayRunner.stop();
    watersRunner.stop();
    placeRunner.stop();
    naturalWaterRunner.stop();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
