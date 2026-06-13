import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import { zxyToBBox } from '../src/routes/raster.js';

async function waitForMockCalled(mockFn, timeoutMs = 500) {
  const start = Date.now();

  while (mockFn.mock.calls.length === 0) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for mock to be called');
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

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
  it('downloads and caches the satellite tile to the adopted path', async () => {
    const fetchTile = vi.fn().mockResolvedValue({
      created: true,
      path: '/tmp/.tiles/11/1024/768/satellite.jpeg'
    });
    const app = createApp({
      raster: {
        fetchSatelliteTile: fetchTile,
        fetchDemTile: vi.fn(),
        renderDemPng: vi.fn()
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

  it('dedupes concurrent downloads for the same satellite tile', async () => {
    let resolveFetch;
    const fetchTile = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    const app = createApp({
      raster: {
        fetchSatelliteTile: fetchTile,
        fetchDemTile: vi.fn(),
        renderDemPng: vi.fn()
      }
    });

    const first = request(app).get('/raster/satellite/11/1024/768');
    const second = request(app).get('/raster/satellite/11/1024/768');
    const responsesPromise = Promise.all([first, second]);

    await waitForMockCalled(fetchTile);

    resolveFetch({ created: true, path: '/tmp/.tiles/11/1024/768/satellite.jpeg' });

    const [response1, response2] = await responsesPromise;

    expect(fetchTile).toHaveBeenCalledTimes(1);
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
  });
});

describe('GET /raster/dem/:z/:x/:y', () => {
  it('downloads and caches the gtiff and png to the adopted paths', async () => {
    const fetchDemTile = vi.fn().mockResolvedValue({
      gtiffPath: '/tmp/.tiles/11/1024/768/dem.gtiff',
      gtiffCached: false,
      pngPath: '/tmp/.tiles/11/1024/768/dem.png',
      pngCached: false
    });
    const renderDemPng = vi.fn().mockResolvedValue({
      path: '/tmp/.tiles/11/1024/768/dem.png',
      cached: false
    });
    const app = createApp({
      raster: {
        fetchSatelliteTile: vi.fn(),
        fetchDemTile,
        renderDemPng
      }
    });

    const response = await request(app).get('/raster/dem/11/1024/768');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      kind: 'dem',
      gtiffPath: '/tmp/.tiles/11/1024/768/dem.gtiff',
      gtiffCached: false,
      pngPath: '/tmp/.tiles/11/1024/768/dem.png',
      pngCached: false
    });
    expect(fetchDemTile).toHaveBeenCalledWith(11, 1024, 768);
    expect(renderDemPng).toHaveBeenCalledWith('/tmp/.tiles/11/1024/768/dem.gtiff', 11, 1024, 768);
  });

  it('dedupes concurrent dem tile generation requests', async () => {
    let resolveFetchDem;
    const fetchDemTile = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetchDem = resolve;
        })
    );
    const renderDemPng = vi.fn().mockResolvedValue({
      path: '/tmp/.tiles/11/1024/768/dem.png',
      cached: false
    });
    const app = createApp({
      raster: {
        fetchSatelliteTile: vi.fn(),
        fetchDemTile,
        renderDemPng
      }
    });

    const first = request(app).get('/raster/dem/11/1024/768');
    const second = request(app).get('/raster/dem/11/1024/768');
    const responsesPromise = Promise.all([first, second]);

    await waitForMockCalled(fetchDemTile);

    resolveFetchDem({ gtiffPath: '/tmp/.tiles/11/1024/768/dem.gtiff', gtiffCached: false });

    const [response1, response2] = await responsesPromise;

    expect(fetchDemTile).toHaveBeenCalledTimes(1);
    expect(renderDemPng).toHaveBeenCalledTimes(1);
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
  });
});

describe('GET /raster/satellite/:z/:x/:y.jpeg', () => {
  it('streams a satellite jpeg response', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-raster-'));

    try {
      const filePath = join(tempRoot, '11', '1024', '768', 'satellite.jpeg');
      await mkdir(join(tempRoot, '11', '1024', '768'), { recursive: true });
      await writeFile(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const fetchTile = vi.fn().mockResolvedValue({ path: filePath, cached: true });
      const app = createApp({
        raster: {
          fetchSatelliteTile: fetchTile,
          fetchDemTile: vi.fn(),
          renderDemPng: vi.fn()
        }
      });

      const response = await request(app).get('/raster/satellite/11/1024/768.jpeg');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/jpeg/);
      expect(fetchTile).toHaveBeenCalledWith(11, 1024, 768);
      expect(response.body.length).toBeGreaterThan(0);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('GET /raster/dem/:z/:x/:y.png', () => {
  it('streams a dem png response', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-raster-'));

    try {
      const gtiffPath = join(tempRoot, '11', '1024', '768', 'dem.gtiff');
      const pngPath = join(tempRoot, '11', '1024', '768', 'dem.png');
      await mkdir(join(tempRoot, '11', '1024', '768'), { recursive: true });
      await writeFile(gtiffPath, Buffer.from('fake-gtiff'));
      await writeFile(
        pngPath,
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8wXYAAAAASUVORK5CYII=', 'base64')
      );

      const fetchDemTile = vi.fn().mockResolvedValue({ gtiffPath, gtiffCached: true });
      const renderDemPng = vi.fn().mockResolvedValue({ path: pngPath, cached: true });
      const app = createApp({
        raster: {
          fetchSatelliteTile: vi.fn(),
          fetchDemTile,
          renderDemPng
        }
      });

      const response = await request(app).get('/raster/dem/11/1024/768.png');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/png/);
      expect(fetchDemTile).toHaveBeenCalledWith(11, 1024, 768);
      expect(renderDemPng).toHaveBeenCalledWith(gtiffPath, 11, 1024, 768);
      expect(response.body.length).toBeGreaterThan(0);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('GET /raster/dem/:z/:x/:y/png', () => {
  it('renders the cached png asset and returns its path', async () => {
    const fetchDemTile = vi.fn().mockResolvedValue({
      gtiffPath: '/tmp/.tiles/11/1024/768/dem.gtiff',
      gtiffCached: true
    });
    const renderDemPng = vi.fn().mockResolvedValue({
      path: '/tmp/.tiles/11/1024/768/dem.png',
      cached: true
    });
    const app = createApp({
      raster: {
        fetchSatelliteTile: vi.fn(),
        fetchDemTile,
        renderDemPng
      }
    });

    const response = await request(app).get('/raster/dem/11/1024/768/png');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      kind: 'dem-png',
      path: '/tmp/.tiles/11/1024/768/dem.png',
      cached: true
    });
    expect(fetchDemTile).toHaveBeenCalledWith(11, 1024, 768);
    expect(renderDemPng).toHaveBeenCalledWith('/tmp/.tiles/11/1024/768/dem.gtiff', 11, 1024, 768);
  });

  it('dedupes concurrent png render requests', async () => {
    let resolveFetchDem;
    const fetchDemTile = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetchDem = resolve;
        })
    );
    const renderDemPng = vi.fn().mockResolvedValue({
      path: '/tmp/.tiles/11/1024/768/dem.png',
      cached: false
    });
    const app = createApp({
      raster: {
        fetchSatelliteTile: vi.fn(),
        fetchDemTile,
        renderDemPng
      }
    });

    const first = request(app).get('/raster/dem/11/1024/768/png');
    const second = request(app).get('/raster/dem/11/1024/768/png');
    const responsesPromise = Promise.all([first, second]);

    await waitForMockCalled(fetchDemTile);

    resolveFetchDem({ gtiffPath: '/tmp/.tiles/11/1024/768/dem.gtiff', gtiffCached: false });

    const [response1, response2] = await responsesPromise;

    expect(fetchDemTile).toHaveBeenCalledTimes(1);
    expect(renderDemPng).toHaveBeenCalledTimes(1);
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
  });

  it('returns 500 when the raster cannot be normalized into a renderable png', async () => {
    const fetchDemTile = vi.fn().mockResolvedValue({
      gtiffPath: '/tmp/.tiles/11/1024/768/dem.gtiff',
      gtiffCached: true
    });
    const renderDemPng = vi.fn().mockRejectedValue(new Error('Raster contains no usable elevation values'));
    const app = createApp({
      raster: {
        fetchSatelliteTile: vi.fn(),
        fetchDemTile,
        renderDemPng
      }
    });

    const response = await request(app).get('/raster/dem/11/1024/768/png');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'DEM_PNG_RENDER_FAILED',
        reason: 'Internal server error'
      }
    });
  });
});
