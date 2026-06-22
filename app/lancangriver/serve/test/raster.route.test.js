import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import { zxyToBBox } from '../src/routes/raster.js';

describe('zxyToBBox', () => {
  it('returns the EPSG:4326 bbox for a z11 tile', () => {
    expect(zxyToBBox(11, 1024, 768)).toEqual([
      0,
      40.84706035607122,
      0.17578125,
      40.97989806962013
    ]);
  });
});

describe('GET /raster/satellite/:z/:x/:y', () => {
  it('delegates satellite loading and returns json metadata', async () => {
    const fetchTile = vi.fn().mockResolvedValue({
      created: true,
      path: '/tmp/.tiles/11/1024/768/satellite.jpeg'
    });
    const app = createApp({
      raster: {
        fetchSatelliteTile: fetchTile
      }
    });

    const response = await request(app).get('/raster/satellite/11/1024/768');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      kind: 'satellite',
      path: '/tmp/.tiles/11/1024/768/satellite.jpeg',
      created: true
    });
    expect(fetchTile).toHaveBeenCalledWith(11, 1024, 768);
  });
});

describe('GET /raster/dem/:z/:x/:y.png', () => {
  it('downloads and streams a dem png when it is missing locally', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-raster-'));
    const fetchTile = vi.fn().mockResolvedValue({
      path: join(tempRoot, '11', '1024', '768', 'dem.png'),
      cached: false
    });

    try {
      const pngPath = join(tempRoot, '11', '1024', '768', 'dem.png');
      await mkdir(join(tempRoot, '11', '1024', '768'), { recursive: true });
      await writeFile(
        pngPath,
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8wXYAAAAASUVORK5CYII=',
          'base64'
        )
      );

      const app = createApp({
        raster: {
          rasterRoot: tempRoot,
          fetchDemPngTile: fetchTile
        }
      });

      const response = await request(app).get('/raster/dem/11/1024/768.png');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/png/);
      expect(response.body.length).toBeGreaterThan(0);
      expect(fetchTile).toHaveBeenCalledWith(11, 1024, 768);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
  it('rejects dem zoom levels above 15', async () => {
    const app = createApp({
      raster: {
        fetchDemPngTile: vi.fn(),
        fetchSatelliteTile: vi.fn()
      }
    });

    const response = await request(app).get('/raster/dem/16/0/0.png');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'DEM_ZOOM_TOO_HIGH',
        reason: 'DEM tiles only support zoom levels up to 15'
      }
    });
  });
});

describe('GET /raster/dem/:z/:x/:y', () => {
  it('returns dem png metadata from local zxy folder', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-raster-'));

    try {
      const pngPath = join(tempRoot, '11', '1024', '768', 'dem.png');
      await mkdir(join(tempRoot, '11', '1024', '768'), { recursive: true });
      await writeFile(pngPath, Buffer.from('png'));

      const app = createApp({
        raster: {
          rasterRoot: tempRoot,
          fetchSatelliteTile: vi.fn()
        }
      });

      const response = await request(app).get('/raster/dem/11/1024/768');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        kind: 'dem',
        pngPath,
        pngCached: true
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('GET /raster/dem/:z/:x/:y/png', () => {
  it('returns dem png metadata from local zxy folder', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-raster-'));

    try {
      const pngPath = join(tempRoot, '11', '1024', '768', 'dem.png');
      await mkdir(join(tempRoot, '11', '1024', '768'), { recursive: true });
      await writeFile(pngPath, Buffer.from('png'));

      const app = createApp({
        raster: {
          rasterRoot: tempRoot,
          fetchSatelliteTile: vi.fn()
        }
      });

      const response = await request(app).get('/raster/dem/11/1024/768/png');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        kind: 'dem-png',
        path: pngPath,
        cached: true
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
