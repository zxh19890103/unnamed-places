import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import sharp from 'sharp';
import exifr from 'exifr';
import { createApp } from '../src/server.js';
import { scanGeotaggedPhotos } from '../src/photos/scanGeotaggedPhotos.js';

vi.mock('exifr', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: { ...actual.default } };
});

describe('photo directory browsing and recursive scanning', () => {
  let temporaryRoot;
  let browseRoot;

  beforeAll(async () => {
    temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'photo-folders-')));
    browseRoot = join(temporaryRoot, 'allowed');
    await mkdir(join(browseRoot, 'nested'), { recursive: true });
    await mkdir(join(temporaryRoot, 'outside'));
    await writeFile(join(browseRoot, 'first.jpg'), 'fixture');
    await writeFile(join(browseRoot, 'nested', 'second.jpg'), 'fixture');
    await symlink(join(temporaryRoot, 'outside'), join(browseRoot, 'escape'));
    await symlink(browseRoot, join(browseRoot, 'loop'));
    await symlink(browseRoot, join(temporaryRoot, 'alias'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  const browseApp = () => createApp({ photoBrowseRoots: [browseRoot] });

  it.each(['~/Documents', '["~/Documents"]', '[]', '{}'])(
    'explains invalid browse root configuration: %s',
    async (configuredRoots) => {
      vi.stubEnv('PHOTO_BROWSE_ROOTS', configuredRoots);
      const response = await request(createApp()).get('/photos/directories');
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INVALID_PHOTO_BROWSE_ROOTS');
      expect(response.body.error.reason).toContain('JSON array of absolute paths');
    },
  );

  it('uses the configured environment roots', async () => {
    vi.stubEnv('PHOTO_BROWSE_ROOTS', JSON.stringify([browseRoot]));
    const response = await request(createApp()).get('/photos/directories');
    expect(response.status).toBe(200);
    expect(response.body.path).toBe(browseRoot);
  });

  it('lists only directories and stops parent navigation at the allowed root', async () => {
    const response = await request(browseApp()).get('/photos/directories');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      path: browseRoot,
      parent: null,
      roots: [browseRoot],
      directories: [{ name: 'nested', path: join(browseRoot, 'nested') }],
      nextOffset: null,
    });
  });

  it('allows the configured client origin', async () => {
    const response = await request(browseApp())
      .get('/photos/directories')
      .set('Origin', 'http://localhost:5173');
    expect(response.status).toBe(200);
  });

  it('rejects unknown origins and hosts', async () => {
    expect(
      (await request(browseApp()).get('/photos/directories').set('Origin', 'https://example.com'))
        .status,
    ).toBe(403);
    expect(
      (await request(browseApp()).get('/photos/directories').set('Host', 'example.com')).status,
    ).toBe(403);
  });

  it('rejects traversal and symlink escapes', async () => {
    for (const directory of [join(browseRoot, '..'), join(browseRoot, 'escape')]) {
      const response = await request(browseApp())
        .get('/photos/directories')
        .query({ path: directory });
      expect(response.status).toBe(403);
    }
  });

  it('reports missing paths and non-directories', async () => {
    for (const directory of [join(browseRoot, 'missing'), join(browseRoot, 'first.jpg')]) {
      const response = await request(browseApp())
        .get('/photos/directories')
        .query({ path: directory });
      expect(response.status).toBe(400);
    }
  });

  it('paginates large directory listings', async () => {
    const paginatedRoot = join(temporaryRoot, 'paginated');
    await mkdir(paginatedRoot);
    await Promise.all(
      Array.from({ length: 101 }, (_, index) =>
        mkdir(join(paginatedRoot, String(index).padStart(3, '0'))),
      ),
    );
    const app = createApp({ photoBrowseRoots: [paginatedRoot] });
    const first = await request(app).get('/photos/directories');
    const second = await request(app)
      .get('/photos/directories')
      .query({ offset: first.body.nextOffset });
    expect(first.body.directories).toHaveLength(100);
    expect(second.body.directories).toHaveLength(1);
    expect(second.body.nextOffset).toBeNull();
  });

  it('keeps shallow scanning as default, includes nested photos on request, and skips symlinks', async () => {
    vi.spyOn(exifr, 'parse').mockResolvedValue({
      latitude: 0,
      longitude: 0,
      DateTimeOriginal: new Date('2024-01-02T03:04:05Z'),
    });
    const shallow = await scanGeotaggedPhotos(browseRoot);
    const recursive = await scanGeotaggedPhotos(browseRoot, { recursive: true });
    const aliased = await scanGeotaggedPhotos(join(temporaryRoot, 'alias'), { recursive: true });
    expect(shallow).toHaveLength(1);
    expect(recursive).toHaveLength(2);
    expect(aliased).toEqual(recursive);
    expect(recursive[0]).toMatchObject({ lat: 0, lng: 0, takenAt: '2024-01-02T03:04:05.000Z' });
  });

  it('keeps valid photos when another photo has unreadable metadata', async () => {
    vi.spyOn(exifr, 'parse').mockImplementation(async (filePath) => {
      if (filePath.endsWith('first.jpg')) throw new Error('Bad EXIF');
      return { latitude: 23, longitude: 112 };
    });
    const onWarning = vi.fn();
    const photos = await scanGeotaggedPhotos(browseRoot, { recursive: true, onWarning });
    expect(photos).toHaveLength(1);
    expect(onWarning).toHaveBeenCalledWith({
      path: join(browseRoot, 'first.jpg'),
      reason: 'Photo metadata could not be read',
    });
  });

  it('stops scanning when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const parse = vi.spyOn(exifr, 'parse');
    await expect(
      scanGeotaggedPhotos(browseRoot, { recursive: true, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('passes recursion through the API and bounds warning details', async () => {
    const scan = vi.fn(async (_root, options) => {
      for (let index = 0; index < 60; index += 1)
        options.onWarning({ path: String(index), reason: 'Unreadable' });
      return [];
    });
    const response = await request(createApp({ scanGeotaggedPhotos: scan }))
      .get('/photos/geotagged')
      .query({ root: browseRoot, recursive: 'true' });
    expect(response.status).toBe(200);
    expect(scan.mock.calls[0][1].recursive).toBe(true);
    expect(response.body.warningCount).toBe(60);
    expect(response.body.warnings).toHaveLength(50);
  });

  it('reports permission failures separately from empty folders', async () => {
    const scan = vi.fn().mockRejectedValue(Object.assign(new Error('Denied'), { code: 'EACCES' }));
    const response = await request(createApp({ scanGeotaggedPhotos: scan }))
      .get('/photos/geotagged')
      .query({ root: browseRoot });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROOT_UNREADABLE');
  });
});

describe('GET /photos/geotagged', () => {
  it('returns normalized records', async () => {
    const scanGeotaggedPhotos = vi.fn().mockResolvedValue([
      {
        id: '1',
        filePath: '/tmp/a.jpg',
        lat: 40.746,
        lng: 14.498,
        takenAt: null,
      },
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
          takenAt: null,
        },
      ],
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
        reason: 'Query param root must point to an existing directory',
      },
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
        reason: 'Internal server error',
      },
    });
  });
});

describe('GET /photos/original/:id', () => {
  const fixtureDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'photos-original',
  );
  const imagePath = resolve(fixtureDir, 'sample.jpg');

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('returns original bytes when file exists', async () => {
    await mkdir(fixtureDir, { recursive: true });
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await writeFile(imagePath, jpegBytes);

    const app = createApp();
    const response = await request(app).get(`/photos/original/${encodeURIComponent(imagePath)}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.from(response.body)).toEqual(jpegBytes);
  });

  it('returns 404 when file does not exist', async () => {
    const missingPath = resolve(fixtureDir, 'missing.jpg');
    const app = createApp();
    const response = await request(app).get(`/photos/original/${encodeURIComponent(missingPath)}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'PHOTO_FILE_NOT_FOUND',
        reason: 'Photo file does not exist',
      },
    });
  });
});

describe('GET /photos/thumb/:id', () => {
  const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'photos-thumb');
  const imagePath = resolve(fixtureDir, 'sample.png');
  const photosRoot = resolve(fixtureDir, '.photos-cache');

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('creates and caches a webp thumb', async () => {
    await mkdir(fixtureDir, { recursive: true });

    const pngBytes = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(imagePath, pngBytes);

    const app = createApp({ photosRoot });
    const id = encodeURIComponent(imagePath);

    const first = await request(app).get(`/photos/thumb/${id}`);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toContain('image/webp');

    const second = await request(app).get(`/photos/thumb/${id}`);
    expect(second.status).toBe(200);
    expect(second.headers['content-type']).toContain('image/webp');
  });

  it('returns 404 when source image does not exist', async () => {
    const missingPath = resolve(fixtureDir, 'missing.png');
    const app = createApp({ photosRoot });
    const response = await request(app).get(`/photos/thumb/${encodeURIComponent(missingPath)}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'PHOTO_FILE_NOT_FOUND',
        reason: 'Photo file does not exist',
      },
    });
  });
});
