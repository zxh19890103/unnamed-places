import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import exifr from 'exifr';
import { scanGeotaggedPhotos as defaultScanGeotaggedPhotos } from '../photos/scanGeotaggedPhotos.js';
import { listPhotoDirectories } from '../photos/listPhotoDirectories.js';

function getDefaultPhotosRoot() {
  const routeDir = dirname(fileURLToPath(import.meta.url));
  return resolve(routeDir, '../../.photos');
}

function createErrorPayload(code, reason) {
  return {
    error: {
      code,
      reason,
    },
  };
}

export function createPhotosRouter(options = {}) {
  const router = Router();
  const scanGeotaggedPhotos = options.scanGeotaggedPhotos ?? defaultScanGeotaggedPhotos;
  const photosRoot = options.photosRoot ? resolve(options.photosRoot) : getDefaultPhotosRoot();

  router.get('/photos/directories', async (req, res) => {
    const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
    const trustedOrigins =
      options.photoBrowseOrigins ??
      (
        process.env.PHOTO_BROWSE_ORIGINS ||
        'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'
      )
        .split(',')
        .map((origin) => origin.trim());
    let hostname;
    try {
      hostname = new URL(`http://${req.headers.host}`).hostname;
    } catch {
      hostname = '';
    }
    if (
      !loopback.has(req.socket.remoteAddress) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
      (req.headers.origin && !trustedOrigins.includes(req.headers.origin))
    ) {
      res
        .status(403)
        .json(
          createErrorPayload(
            'FOLDER_BROWSE_DENIED',
            'Folder browsing is restricted to trusted local clients',
          ),
        );
      return;
    }

    try {
      const listing = await listPhotoDirectories({
        roots: options.photoBrowseRoots,
        directory: typeof req.query.path === 'string' ? req.query.path : undefined,
        offset: req.query.offset,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json(listing);
    } catch (error) {
      const forbidden = ['OUTSIDE_BROWSE_ROOT', 'EACCES', 'EPERM'].includes(error.code);
      const missing = ['ENOENT', 'ENOTDIR'].includes(error.code);
      res
        .status(forbidden ? 403 : missing ? 400 : 500)
        .json(
          createErrorPayload(
            error.code || 'FOLDER_BROWSE_FAILED',
            error.code === 'INVALID_PHOTO_BROWSE_ROOTS'
              ? error.message
              : forbidden
                ? 'Folder is outside allowed locations or cannot be read'
                : missing
                  ? 'Folder does not exist or is not a directory'
                  : 'Could not list folders',
          ),
        );
    }
  });

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
          reason: 'Query param root is required',
        },
      });
      return;
    }

    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.on('close', cancel);

    try {
      const warnings = [];
      let warningCount = 0;
      const recursive = req.query.recursive === 'true';
      const photos = await scanGeotaggedPhotos(root, {
        recursive,
        signal: controller.signal,
        onWarning: (warning) => {
          warningCount += 1;
          if (warnings.length < 50) warnings.push(warning);
        },
      });
      if (!controller.signal.aborted) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
          photos: Array.isArray(photos) ? photos : [],
          ...(recursive ? { warnings, warningCount } : {}),
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error && typeof error === 'object' ? error.code : null;

      if (code === 'EACCES' || code === 'EPERM') {
        res.status(403).json(createErrorPayload('ROOT_UNREADABLE', 'Photo folder cannot be read'));
        return;
      }

      if (code === 'ENOENT' || code === 'ENOTDIR') {
        res.status(400).json({
          error: {
            code: 'ROOT_NOT_FOUND',
            reason: 'Query param root must point to an existing directory',
          },
        });
        return;
      }

      console.error('Error scanning geotagged photos:', error);

      res.status(500).json({
        error: {
          code: 'PHOTOS_SCAN_FAILED',
          reason: 'Internal server error',
        },
      });
    } finally {
      res.off('close', cancel);
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
          width: 128,
          height: 128,
          fit: 'inside',
          withoutEnlargement: true,
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

      res.status(500).json(createErrorPayload('PHOTO_ORIGINAL_FAILED', 'Internal server error'));
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
      res.status(500).json(createErrorPayload('PHOTO_ORIGINAL_FAILED', 'Internal server error'));
    }
  });

  router.get('/photos/exif/:id', async (req, res) => {
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

      res.status(500).json(createErrorPayload('PHOTO_EXIF_FAILED', 'Internal server error'));
      return;
    }

    try {
      const [data, stats] = await Promise.all([
        exifr.parse(filePath, {
          exif: true,
          gps: true,
          iptc: true,
          icc: false,
          xmp: true,
          ifd0: true,
          ifd1: false,
          makerNote: false,
          userComment: true,
          translateKeys: true,
          translateValues: true,
          reviveValues: true,
        }),
        stat(filePath),
      ]);

      const imageWidth = data?.ExifImageWidth ?? data?.ImageWidth ?? null;
      const imageHeight = data?.ExifImageHeight ?? data?.ImageHeight ?? null;
      const focalLength = data?.FocalLength ?? null;
      const focalLength35mm = data?.FocalLengthIn35mmFormat ?? null;

      const exif = {
        filePath,
        fileName: filePath.split('/').pop() ?? '',
        sizeBytes: stats.size,
        make: data?.Make ?? null,
        model: data?.Model ?? null,
        lensMake: data?.LensMake ?? null,
        lensModel: data?.LensModel ?? null,
        imageWidth,
        imageHeight,
        orientation: data?.Orientation ?? null,
        focalLength,
        focalLengthIn35mmFormat: focalLength35mm,
        fNumber: data?.FNumber ?? null,
        exposureTime: data?.ExposureTime ?? null,
        iso: data?.ISO ?? null,
        exposureProgram: data?.ExposureProgram ?? null,
        meteringMode: data?.MeteringMode ?? null,
        flash: data?.Flash ?? null,
        whiteBalance: data?.WhiteBalance ?? null,
        dateTimeOriginal: data?.DateTimeOriginal ?? null,
        createDate: data?.CreateDate ?? null,
        offsetTime: data?.OffsetTime ?? null,
        latitude: data?.latitude ?? null,
        longitude: data?.longitude ?? null,
        altitude: data?.altitude ?? data?.GPSAltitude ?? null,
        gpsImgDirection: data?.GPSImgDirection ?? null,
        gpsImgDirectionRef: data?.GPSImgDirectionRef ?? null,
        software: data?.Software ?? null,
        hasMotionPhoto: data?.MotionPhoto === 1,
      };

      res.status(200).json({ exif });
    } catch (error) {
      console.error('Error parsing photo EXIF:', error);
      res.status(500).json(createErrorPayload('PHOTO_EXIF_FAILED', 'Internal server error'));
    }
  });

  return router;
}
