import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';

const routesDir = dirname(fileURLToPath(import.meta.url));
const defaultCenterlineGeojsonPath = resolve(
  routesDir,
  '../../../pipeline/output/centerline/lancang_main_stem.geojson'
);

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

  return router;
}