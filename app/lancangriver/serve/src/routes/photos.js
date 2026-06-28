import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { scanGeotaggedPhotos as defaultScanGeotaggedPhotos } from '../photos/scanGeotaggedPhotos.js';

function getDefaultPhotosRoot() {
  const routeDir = dirname(fileURLToPath(import.meta.url));
  return resolve(routeDir, '../../.photos');
}

function createErrorPayload(code, reason) {
  return {
    error: {
      code,
      reason
    }
  };
}

export function createPhotosRouter(options = {}) {
  const router = Router();
  const scanGeotaggedPhotos = options.scanGeotaggedPhotos ?? defaultScanGeotaggedPhotos;
  const photosRoot = options.photosRoot ? resolve(options.photosRoot) : getDefaultPhotosRoot();

  const idToFilePath = (id) => {
    if (typeof id !== 'string' || !id) {
      return '';
    }

    try {
      return decodeURIComponent(id);
    } catch {
      return '';
    }
  };

  const idToThumbId = (id) => {
    if (typeof id !== 'string' || !id) {
      return '';
    }

    // Keep cache key deterministic while avoiding path separators/invalid filename chars.
    return createHash('sha1').update(id).digest('hex');
  };

  router.get('/photos/geotagged', async (req, res) => {
    const root = typeof req.query.root === 'string' ? req.query.root : '';

    if (!root) {
      res.status(400).json({
        error: {
          code: 'INVALID_ROOT',
          reason: 'Query param root is required'
        }
      });
      return;
    }

    try {
      const photos = await scanGeotaggedPhotos(root);
      res.status(200).json({ photos: Array.isArray(photos) ? photos : [] });
    } catch (error) {
      const code = error && typeof error === 'object' ? error.code : null;

      if (code === 'ENOENT' || code === 'ENOTDIR') {
        res.status(400).json({
          error: {
            code: 'ROOT_NOT_FOUND',
            reason: 'Query param root must point to an existing directory'
          }
        });
        return;
      }

      console.error('Error scanning geotagged photos:', error);

      res.status(500).json({
        error: {
          code: 'PHOTOS_SCAN_FAILED',
          reason: 'Internal server error'
        }
      });
    }
  });

  router.get('/photos/thumb/:id', async (req, res) => {
    const filePath = idToFilePath(req.params.id);

    if (!filePath) {
      res.status(400).json(createErrorPayload('INVALID_ID', 'Path param id is required'));
      return;
    }

    try {
      await access(filePath);
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        res
          .status(404)
          .json(createErrorPayload('PHOTO_FILE_NOT_FOUND', 'Photo file does not exist'));
        return;
      }

      res.status(500).json(createErrorPayload('PHOTO_THUMB_FAILED', 'Internal server error'));
      return;
    }

    const thumbDir = resolve(photosRoot, 'thumb');
    const thumbPath = resolve(thumbDir, `${idToThumbId(req.params.id)}.webp`);

    try {
      await mkdir(thumbDir, { recursive: true });
      await access(thumbPath);

      res.setHeader('content-type', 'image/webp');
      createReadStream(thumbPath).pipe(res);
      return;
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        res.status(500).json(createErrorPayload('PHOTO_THUMB_FAILED', 'Internal server error'));
        return;
      }
    }

    try {
      const thumbBuffer = await sharp(filePath)
        .rotate()
        .resize({
          width: 512,
          height: 512,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toBuffer();

      await writeFile(thumbPath, thumbBuffer);

      res.setHeader('content-type', 'image/webp');
      res.status(200).send(thumbBuffer);
    } catch (error) {
      console.error('Error creating photo thumbnail:', error);
      res.status(500).json(createErrorPayload('PHOTO_THUMB_FAILED', 'Internal server error'));
    }
  });

  router.get('/photos/original/:id', async (req, res) => {
    const filePath = idToFilePath(req.params.id);

    if (!filePath) {
      res.status(400).json(createErrorPayload('INVALID_ID', 'Path param id is required'));
      return;
    }

    try {
      await access(filePath);
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        res
          .status(404)
          .json(createErrorPayload('PHOTO_FILE_NOT_FOUND', 'Photo file does not exist'));
        return;
      }

      res
        .status(500)
        .json(createErrorPayload('PHOTO_ORIGINAL_FAILED', 'Internal server error'));
      return;
    }

    try {
      const ext = extname(filePath).toLowerCase();
      const contentType =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : 'application/octet-stream';

      const bytes = await readFile(filePath);

      res.setHeader('content-type', contentType);
      res.status(200).send(bytes);
    } catch (error) {
      console.error('Error serving original photo:', error);
      res
        .status(500)
        .json(createErrorPayload('PHOTO_ORIGINAL_FAILED', 'Internal server error'));
    }
  });

  return router;
}
