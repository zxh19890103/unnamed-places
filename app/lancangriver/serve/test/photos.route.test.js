import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

describe('GET /photos/geotagged', () => {
  it('returns normalized records', async () => {
    const scanGeotaggedPhotos = vi.fn().mockResolvedValue([
      {
        id: '1',
        filePath: '/tmp/a.jpg',
        lat: 40.746,
        lng: 14.498,
        takenAt: null
      }
    ]);

    const app = createApp({ scanGeotaggedPhotos });
    const response = await request(app).get('/photos/geotagged').query({ root: '/tmp' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      photos: [
        {
          id: '1',
          filePath: '/tmp/a.jpg',
          lat: 40.746,
          lng: 14.498,
          takenAt: null
        }
      ]
    });
  });

  it('returns 400 when root is missing', async () => {
    const app = createApp({ scanGeotaggedPhotos: vi.fn() });
    const response = await request(app).get('/photos/geotagged');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ROOT');
  });

  it('returns an empty photos list when scanner returns none', async () => {
    const scanGeotaggedPhotos = vi.fn().mockResolvedValue([]);
    const app = createApp({ scanGeotaggedPhotos });

    const response = await request(app).get('/photos/geotagged').query({ root: '/tmp' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ photos: [] });
  });

  it('returns 400 when root directory does not exist', async () => {
    const error = new Error('no such file or directory');
    error.code = 'ENOENT';
    const scanGeotaggedPhotos = vi.fn().mockRejectedValue(error);
    const app = createApp({ scanGeotaggedPhotos });

    const response = await request(app).get('/photos/geotagged').query({ root: '/tmp/photos' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'ROOT_NOT_FOUND',
        reason: 'Query param root must point to an existing directory'
      }
    });
  });

  it('returns 500 when scanner throws unexpected error', async () => {
    const scanGeotaggedPhotos = vi.fn().mockRejectedValue(new Error('unexpected failure'));
    const app = createApp({ scanGeotaggedPhotos });

    const response = await request(app).get('/photos/geotagged').query({ root: '/tmp' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'PHOTOS_SCAN_FAILED',
        reason: 'Internal server error'
      }
    });
  });
});
