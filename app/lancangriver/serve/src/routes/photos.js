import { Router } from 'express';
import { scanGeotaggedPhotos as defaultScanGeotaggedPhotos } from '../photos/scanGeotaggedPhotos.js';

export function createPhotosRouter(options = {}) {
  const router = Router();
  const scanGeotaggedPhotos = options.scanGeotaggedPhotos ?? defaultScanGeotaggedPhotos;

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

  return router;
}
