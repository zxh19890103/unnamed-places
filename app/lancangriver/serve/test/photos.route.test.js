import { describe, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('GET /photos/original/:id', () => {
  const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'photos-original');
  const imagePath = resolve(fixtureDir, 'sample.jpg');

  it('returns original bytes when file exists', async () => {
    try {
      await mkdir(fixtureDir, { recursive: true });
      const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      await writeFile(imagePath, jpegBytes);

      const app = createApp();
      const response = await request(app).get(`/photos/original/${encodeURIComponent(imagePath)}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/jpeg');
      expect(Buffer.from(response.body)).toEqual(jpegBytes);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('returns 404 when file does not exist', async () => {
    const missingPath = resolve(fixtureDir, 'missing.jpg');
    const app = createApp();
    const response = await request(app).get(`/photos/original/${encodeURIComponent(missingPath)}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'PHOTO_FILE_NOT_FOUND',
        reason: 'Photo file does not exist'
      }
    });
  });
});

describe('GET /photos/thumb/:id', () => {
  const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'photos-thumb');
  const imagePath = resolve(fixtureDir, 'sample.png');
  const photosRoot = resolve(fixtureDir, '.photos-cache');

  it('creates and caches a webp thumb', async () => {
    try {
      await mkdir(fixtureDir, { recursive: true });

      // 1x1 transparent png
      const pngBytes = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082',
        'hex'
      );
      await writeFile(imagePath, pngBytes);

      const app = createApp({ photosRoot });
      const id = encodeURIComponent(imagePath);

      const first = await request(app).get(`/photos/thumb/${id}`);
      expect(first.status).toBe(200);
      expect(first.headers['content-type']).toContain('image/webp');

      const second = await request(app).get(`/photos/thumb/${id}`);
      expect(second.status).toBe(200);
      expect(second.headers['content-type']).toContain('image/webp');
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('returns 404 when source image does not exist', async () => {
    const missingPath = resolve(fixtureDir, 'missing.png');
    const app = createApp({ photosRoot });
    const response = await request(app).get(`/photos/thumb/${encodeURIComponent(missingPath)}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'PHOTO_FILE_NOT_FOUND',
        reason: 'Photo file does not exist'
      }
    });
  });
});
