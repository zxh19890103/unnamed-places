import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

describe('stats routes', () => {
  it('initializes tile bytes once and serves cached value for later requests', async () => {
    const tilesRoot = await mkdtemp(join(tmpdir(), 'lancangriver-stats-'));

    try {
      await mkdir(join(tilesRoot, '11', '1024', '768'), { recursive: true });
      await writeFile(join(tilesRoot, '11', '1024', '768', 'a.bin'), Buffer.alloc(5));

      const app = createApp({
        stats: {
          tilesRoot
        }
      });

      const firstResponse = await request(app).get('/stats/tiles/bytes');
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.ok).toBe(true);
      expect(firstResponse.body.bytes).toBe(5);
      expect(firstResponse.body.cached).toBe(false);

      await writeFile(join(tilesRoot, '11', '1024', '768', 'b.bin'), Buffer.alloc(7));

      const secondResponse = await request(app).get('/stats/tiles/bytes');
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.ok).toBe(true);
      expect(secondResponse.body.bytes).toBe(5);
      expect(secondResponse.body.cached).toBe(true);
    } finally {
      await rm(tilesRoot, { recursive: true, force: true });
    }
  });

  it('forces recompute when POST /stats/tiles/bytes/recompute is called', async () => {
    const tilesRoot = await mkdtemp(join(tmpdir(), 'lancangriver-stats-'));

    try {
      await mkdir(join(tilesRoot, '11', '1024', '768'), { recursive: true });
      await writeFile(join(tilesRoot, '11', '1024', '768', 'a.bin'), Buffer.alloc(5));

      const app = createApp({
        stats: {
          tilesRoot
        }
      });

      const firstResponse = await request(app).get('/stats/tiles/bytes');
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.bytes).toBe(5);

      await writeFile(join(tilesRoot, '11', '1024', '768', 'b.bin'), Buffer.alloc(7));

      const recomputeResponse = await request(app).post('/stats/tiles/bytes/recompute');
      expect(recomputeResponse.status).toBe(200);
      expect(recomputeResponse.body.ok).toBe(true);
      expect(recomputeResponse.body.bytes).toBe(12);
      expect(recomputeResponse.body.recomputed).toBe(true);
      expect(recomputeResponse.body.cached).toBe(false);
    } finally {
      await rm(tilesRoot, { recursive: true, force: true });
    }
  });
});
