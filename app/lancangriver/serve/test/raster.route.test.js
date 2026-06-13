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
  it('downloads and caches the satellite tile to the adopted path', async () => {
    const fetchTile = vi.fn().mockResolvedValue({
      created: true,
      path: '/tmp/tiles/11/1024/768/satellite.jpeg'
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
      path: '/tmp/tiles/11/1024/768/satellite.jpeg',
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

    resolveFetch({ created: true, path: '/tmp/tiles/11/1024/768/satellite.jpeg' });

    const [response1, response2] = await Promise.all([first, second]);

    expect(fetchTile).toHaveBeenCalledTimes(1);
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
  });
});

describe('GET /raster/dem/:z/:x/:y', () => {
  it('downloads and caches the gtiff and png to the adopted paths', async () => {
    const fetchDemTile = vi.fn().mockResolvedValue({
      gtiffPath: '/tmp/tiles/11/1024/768/dem.gtiff',
      gtiffCached: false,
      pngPath: '/tmp/tiles/11/1024/768/dem.png',
      pngCached: false
    });
    const renderDemPng = vi.fn().mockResolvedValue({
      path: '/tmp/tiles/11/1024/768/dem.png',
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
      gtiffPath: '/tmp/tiles/11/1024/768/dem.gtiff',
      gtiffCached: false,
      pngPath: '/tmp/tiles/11/1024/768/dem.png',
      pngCached: false
    });
    expect(fetchDemTile).toHaveBeenCalledWith(11, 1024, 768);
    expect(renderDemPng).toHaveBeenCalledWith('/tmp/tiles/11/1024/768/dem.gtiff', 11, 1024, 768);
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
      path: '/tmp/tiles/11/1024/768/dem.png',
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

    resolveFetchDem({ gtiffPath: '/tmp/tiles/11/1024/768/dem.gtiff', gtiffCached: false });

    const [response1, response2] = await Promise.all([first, second]);

    expect(fetchDemTile).toHaveBeenCalledTimes(1);
    expect(renderDemPng).toHaveBeenCalledTimes(1);
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
  });
});

describe('GET /raster/dem/:z/:x/:y/png', () => {
  it('renders the cached png asset and returns its path', async () => {
    const fetchDemTile = vi.fn().mockResolvedValue({
      gtiffPath: '/tmp/tiles/11/1024/768/dem.gtiff',
      gtiffCached: true
    });
    const renderDemPng = vi.fn().mockResolvedValue({
      path: '/tmp/tiles/11/1024/768/dem.png',
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
      path: '/tmp/tiles/11/1024/768/dem.png',
      cached: true
    });
    expect(fetchDemTile).toHaveBeenCalledWith(11, 1024, 768);
    expect(renderDemPng).toHaveBeenCalledWith('/tmp/tiles/11/1024/768/dem.gtiff', 11, 1024, 768);
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
      path: '/tmp/tiles/11/1024/768/dem.png',
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

    resolveFetchDem({ gtiffPath: '/tmp/tiles/11/1024/768/dem.gtiff', gtiffCached: false });

    const [response1, response2] = await Promise.all([first, second]);

    expect(fetchDemTile).toHaveBeenCalledTimes(1);
    expect(renderDemPng).toHaveBeenCalledTimes(1);
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
  });

  it('returns 500 when the raster cannot be normalized into a renderable png', async () => {
    const fetchDemTile = vi.fn().mockResolvedValue({
      gtiffPath: '/tmp/tiles/11/1024/768/dem.gtiff',
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
