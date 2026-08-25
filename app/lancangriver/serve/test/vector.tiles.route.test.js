import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

function parseBinary(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('GET /vector/tiles/:z/:x/:y.pbf', () => {
  it('queues missing z12 jobs and returns 204 when coverage is not ready', async () => {
    const queueMissingCoverage = vi.fn().mockResolvedValue({ allReady: false });
    const getVectorTilePbf = vi.fn();
    const app = createApp({ queueMissingCoverage, getVectorTilePbf });

    const response = await request(app).get('/vector/tiles/11/1728/761.pbf');

    expect(response.status).toBe(204);
    expect(queueMissingCoverage).toHaveBeenCalledWith(11, 1728, 761);
    expect(getVectorTilePbf).not.toHaveBeenCalled();
  });

  it('returns 200 and pbf bytes when all coverage is ready', async () => {
    const queueMissingCoverage = vi.fn().mockResolvedValue({ allReady: true });
    const getVectorTilePbf = vi.fn().mockResolvedValue(Buffer.from([0x1a, 0x02, 0x08, 0x01]));
    const app = createApp({ queueMissingCoverage, getVectorTilePbf });

    const response = await request(app).get('/vector/tiles/11/1728/761.pbf');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/x-protobuf/);
    expect(getVectorTilePbf).toHaveBeenCalledWith(11, 1728, 761);
  });
});

describe('GET /vector/tiles-existing/:z/:x/:y.pbf', () => {
  it('returns database PBF bytes without queueing coverage', async () => {
    const queueMissingCoverage = vi.fn();
    const pbf = Buffer.from([0x1a, 0x02, 0x08, 0x01]);
    const getVectorTilePbf = vi.fn().mockResolvedValue(pbf);
    const app = createApp({ queueMissingCoverage, getVectorTilePbf });

    const response = await request(app)
      .get('/vector/tiles-existing/12/1024/1024.pbf')
      .buffer(true)
      .parse(parseBinary);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/x-protobuf/);
    expect(response.body).toEqual(pbf);
    expect(getVectorTilePbf).toHaveBeenCalledWith(12, 1024, 1024);
    expect(queueMissingCoverage).not.toHaveBeenCalled();
  });

  it('rejects invalid coordinates without reading or queueing coverage', async () => {
    const queueMissingCoverage = vi.fn();
    const getVectorTilePbf = vi.fn();
    const app = createApp({ queueMissingCoverage, getVectorTilePbf });

    const response = await request(app).get('/vector/tiles-existing/12/nope/1024.pbf');

    expect(response.status).toBe(400);
    expect(getVectorTilePbf).not.toHaveBeenCalled();
    expect(queueMissingCoverage).not.toHaveBeenCalled();
  });
});

describe('highways-prefixed vector tile routes', () => {
  it('returns highway PBF bytes from the highways tile provider', async () => {
    const queueMissingCoverage = vi.fn();
    const getVectorTilePbf = vi.fn();
    const getVectorTilePbfHighways = vi.fn().mockResolvedValue(Buffer.from([0x1a, 0x01, 0x08]));
    const app = createApp({
      queueMissingCoverage,
      getVectorTilePbf,
      queueMissingCoverageHighways: vi.fn(),
      getVectorTilePbfHighways,
      highwayJobsStore: {
        getStatus: vi.fn().mockResolvedValue('done'),
        listLoaded: vi.fn().mockResolvedValue({ keys: [], total: 0 }),
        listJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
        enqueueIfMissing: vi.fn().mockResolvedValue({ enqueued: false }),
        rerunFailed: vi.fn().mockResolvedValue('queued'),
      },
    });

    const response = await request(app)
      .get('/vector/highways/tiles-existing/12/2212/1539.pbf')
      .buffer(true)
      .parse(parseBinary);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/x-protobuf/);
    expect(getVectorTilePbfHighways).toHaveBeenCalledWith(12, 2212, 1539);
    expect(getVectorTilePbf).not.toHaveBeenCalled();
  });

  it('uses highways coverage status for prefixed coverage route', async () => {
    const highwayJobsStore = {
      getStatus: vi.fn().mockResolvedValue('running'),
      listLoaded: vi.fn().mockResolvedValue({ keys: [], total: 0 }),
      listJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
      enqueueIfMissing: vi.fn().mockResolvedValue({ enqueued: false }),
      rerunFailed: vi.fn().mockResolvedValue('queued'),
    };

    const app = createApp({
      queueMissingCoverage: vi.fn(),
      getVectorTilePbf: vi.fn(),
      queueMissingCoverageHighways: vi.fn(),
      getVectorTilePbfHighways: vi.fn(),
      highwayJobsStore,
    });

    const response = await request(app).get('/vector/highways/coverage/12/2212/1539');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      key: '12/2212/1539',
      status: 'running',
      loaded: false,
    });
    expect(highwayJobsStore.getStatus).toHaveBeenCalledWith('12/2212/1539');
  });
});

describe('vector coverage routes', () => {
  function createCoverageApp(jobsStore) {
    const fullJobsStore = {
      getStatus: vi.fn().mockResolvedValue(null),
      listLoaded: vi.fn().mockResolvedValue({ keys: [], total: 0 }),
      listJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
      enqueueIfMissing: vi.fn().mockResolvedValue({ enqueued: true }),
      rerunFailed: vi.fn().mockResolvedValue('queued'),
      ...jobsStore,
    };

    return createApp({
      jobsStore: fullJobsStore,
      queueMissingCoverage: vi.fn(),
      getVectorTilePbf: vi.fn(),
    });
  }

  it('returns loaded state for one completed z12 tile', async () => {
    const jobsStore = {
      getStatus: vi.fn().mockResolvedValue('done'),
      listLoaded: vi.fn(),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).get('/vector/coverage/12/3456/1523');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      key: '12/3456/1523',
      status: 'done',
      loaded: true,
    });
    expect(jobsStore.getStatus).toHaveBeenCalledWith('12/3456/1523');
  });

  it('returns not loaded state for unknown coverage', async () => {
    const jobsStore = {
      getStatus: vi.fn().mockResolvedValue(null),
      listLoaded: vi.fn(),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).get('/vector/coverage/12/3456/1523');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      key: '12/3456/1523',
      status: null,
      loaded: false,
    });
  });

  it('rejects invalid coverage coordinates', async () => {
    const jobsStore = {
      getStatus: vi.fn(),
      listLoaded: vi.fn(),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).get('/vector/coverage/12/not-a-number/1523');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TILE_COORDS');
    expect(jobsStore.getStatus).not.toHaveBeenCalled();
  });

  it('lists loaded coverage with pagination metadata', async () => {
    const jobsStore = {
      getStatus: vi.fn(),
      listLoaded: vi.fn().mockResolvedValue({
        keys: ['12/3456/1523', '12/3457/1523'],
        total: 2,
      }),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).get('/vector/coverage/loaded?limit=25&offset=50');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tiles: [
        { key: '12/3456/1523', z: 12, x: 3456, y: 1523 },
        { key: '12/3457/1523', z: 12, x: 3457, y: 1523 },
      ],
      limit: 25,
      offset: 50,
      total: 2,
    });
    expect(jobsStore.listLoaded).toHaveBeenCalledWith({ limit: 25, offset: 50 });
  });

  it('rejects invalid coverage pagination', async () => {
    const jobsStore = {
      getStatus: vi.fn(),
      listLoaded: vi.fn(),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).get('/vector/coverage/loaded?limit=0');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PAGINATION');
    expect(jobsStore.listLoaded).not.toHaveBeenCalled();
  });

  it('lists all coverage jobs with their statuses', async () => {
    const jobsStore = {
      getStatus: vi.fn(),
      listLoaded: vi.fn(),
      listJobs: vi.fn().mockResolvedValue({
        jobs: [
          { key: '12/3456/1523', status: 'done' },
          { key: '12/3457/1523', status: 'failed' },
        ],
        total: 2,
      }),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).get('/vector/coverage/jobs?limit=25&offset=0');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      jobs: [
        { key: '12/3456/1523', z: 12, x: 3456, y: 1523, status: 'done' },
        { key: '12/3457/1523', z: 12, x: 3457, y: 1523, status: 'failed' },
      ],
      limit: 25,
      offset: 0,
      total: 2,
    });
    expect(jobsStore.listJobs).toHaveBeenCalledWith({ limit: 25, offset: 0 });
  });

  it('enqueues a coverage job for one canonical z12 tile', async () => {
    const jobsStore = {
      enqueueIfMissing: vi.fn().mockResolvedValue({ enqueued: true }),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).post('/vector/coverage/12/3456/1523/enqueue');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ key: '12/3456/1523', enqueued: true });
    expect(jobsStore.enqueueIfMissing).toHaveBeenCalledWith('12/3456/1523');
  });

  it('reports an existing coverage job without enqueuing again', async () => {
    const jobsStore = {
      enqueueIfMissing: vi.fn().mockResolvedValue({ enqueued: false }),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).post('/vector/coverage/12/3456/1523/enqueue');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ key: '12/3456/1523', enqueued: false });
  });

  it('requeues a failed coverage job', async () => {
    const jobsStore = {
      getStatus: vi.fn(),
      listLoaded: vi.fn(),
      rerunFailed: vi.fn().mockResolvedValue('queued'),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).post('/vector/coverage/12/3456/1523/rerun');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ key: '12/3456/1523', status: 'queued' });
    expect(jobsStore.rerunFailed).toHaveBeenCalledWith('12/3456/1523');
  });

  it.each([
    ['not_found', 404, 'COVERAGE_JOB_NOT_FOUND'],
    ['not_failed', 409, 'COVERAGE_JOB_NOT_FAILED'],
  ])('maps rerun result %s to HTTP %i', async (result, expectedStatus, expectedCode) => {
    const jobsStore = {
      getStatus: vi.fn(),
      listLoaded: vi.fn(),
      rerunFailed: vi.fn().mockResolvedValue(result),
    };
    const app = createCoverageApp(jobsStore);

    const response = await request(app).post('/vector/coverage/12/3456/1523/rerun');

    expect(response.status).toBe(expectedStatus);
    expect(response.body.error.code).toBe(expectedCode);
  });
});
