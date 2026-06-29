import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/server.js';
import { zxyToBBox } from '../src/routes/raster.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8wXYAAAAASUVORK5CYII=',
  'base64'
);

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
        ONE_PIXEL_PNG
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

describe('GET /raster/dem/:z/:x/:y/compose.png', () => {
  it('rejects invalid extent query values', async () => {
    const app = createApp({
      raster: {
        fetchDemPngTile: vi.fn(),
        fetchSatelliteTile: vi.fn()
      }
    });

    const response = await request(app).get('/raster/dem/11/1024/768/compose.png?extent=0');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_EXTENT',
        reason: 'extent must be an integer >= 1'
      }
    });
  });

  it('streams composed png bytes and defaults extent to 1', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-raster-compose-'));
    const composeSpy = vi.fn().mockImplementation(async (_z, _x, _y, _extent) => {
      const outputPath = join(tempRoot, 'composed', 'dem', '11', '1024', '768', 'e1.png');
      await mkdir(join(tempRoot, 'composed', 'dem', '11', '1024', '768'), { recursive: true });
      await writeFile(outputPath, ONE_PIXEL_PNG);

      return {
        outputPath,
        cached: false
      };
    });

    try {
      const app = createApp({
        raster: {
          rasterRoot: tempRoot,
          composeDemNeighborhood: composeSpy
        }
      });

      const response = await request(app).get('/raster/dem/11/1024/768/compose.png');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/png/);
      expect(response.headers['content-type']).not.toMatch(/application\/json/);
      expect(response.body.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
      expect(composeSpy).toHaveBeenCalledWith(11, 1024, 768, 1, 1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('passes through explicit extent to compose flow', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-raster-compose-'));
    const composeSpy = vi.fn().mockImplementation(async (_z, _x, _y, _extent) => {
      const outputPath = join(tempRoot, 'composed', 'dem', '11', '1024', '768', 'e2.png');
      await mkdir(join(tempRoot, 'composed', 'dem', '11', '1024', '768'), { recursive: true });
      await writeFile(outputPath, ONE_PIXEL_PNG);

      return {
        outputPath,
        cached: false
      };
    });

    try {
      const app = createApp({
        raster: {
          rasterRoot: tempRoot,
          composeDemNeighborhood: composeSpy
        }
      });

      const response = await request(app).get('/raster/dem/11/1024/768/compose.png?extent=2');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/png/);
      expect(composeSpy).toHaveBeenCalledWith(11, 1024, 768, 2, 1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('scales composed image dimensions to 1/scale', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-raster-compose-scale-'));

    try {
      const rasterRoot = join(tempRoot, 'tiles');

      const app = createApp({
        raster: {
          rasterRoot,
          fetchDemPngTile: vi.fn(async (_z, x, y) => {
            const tilePath = join(rasterRoot, '11', String(x), String(y), 'dem.png');
            await mkdir(join(rasterRoot, '11', String(x), String(y)), { recursive: true });

            const tileBuffer = await sharp({
              create: {
                width: 256,
                height: 256,
                channels: 4,
                background: { r: x % 255, g: y % 255, b: 120, alpha: 1 }
              }
            })
              .png()
              .toBuffer();

            await writeFile(tilePath, tileBuffer);

            return {
              path: tilePath,
              cached: false
            };
          })
        }
      });

      const response = await request(app).get('/raster/dem/11/1024/768/compose.png?extent=1&scale=2');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/png/);

      const meta = await sharp(response.body).metadata();
      expect(meta.width).toBe(384);
      expect(meta.height).toBe(384);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
