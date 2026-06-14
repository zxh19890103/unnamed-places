import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';

const routesDir = dirname(fileURLToPath(import.meta.url));
const defaultCenterlineGeojsonPath = resolve(
  routesDir,
  '../../../pipeline/output/centerline/lancang_main_stem.geojson'
);
const defaultTilesManifestPath = resolve(routesDir, '../../../pipeline/output/tiles/z11_manifest.json');

function sendCenterlineError(res, status, code, reason) {
  res.status(status).json({
    error: {
      code,
      reason
    }
  });
}

export function createCenterlineRouter(options = {}) {
  const centerlineGeojsonPath =
    typeof options.centerlineGeojsonPath === 'string' && options.centerlineGeojsonPath.length > 0
      ? resolve(options.centerlineGeojsonPath)
      : defaultCenterlineGeojsonPath;
  const tilesManifestPath =
    typeof options.tilesManifestPath === 'string' && options.tilesManifestPath.length > 0
      ? resolve(options.tilesManifestPath)
      : defaultTilesManifestPath;

  const router = Router();

  router.get('/geo/centerline', async (_req, res) => {
    try {
      const rawGeojson = await readFile(centerlineGeojsonPath, 'utf8');
      const parsedGeojson = JSON.parse(rawGeojson);

      res.status(200).json(parsedGeojson);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        sendCenterlineError(res, 404, 'CENTERLINE_NOT_FOUND', 'Centerline GeoJSON file was not found');
        return;
      }

      sendCenterlineError(res, 500, 'CENTERLINE_READ_FAILED', 'Internal server error');
    }
  });

  router.get('/geo/tiles-manifest', async (_req, res) => {
    try {
      const rawManifest = await readFile(tilesManifestPath, 'utf8');
      const parsedManifest = JSON.parse(rawManifest);

      res.status(200).json(parsedManifest);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        sendCenterlineError(res, 404, 'TILES_MANIFEST_NOT_FOUND', 'Tiles manifest file was not found');
        return;
      }

      sendCenterlineError(res, 500, 'TILES_MANIFEST_READ_FAILED', 'Internal server error');
    }
  });

  return router;
}