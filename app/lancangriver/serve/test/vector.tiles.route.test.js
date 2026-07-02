import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

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
