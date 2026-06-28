import './env.js';
import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { createCenterlineRouter } from './routes/centerline.js';
import { createHealthRouter } from './routes/health.js';
import { createRasterRouter } from './routes/raster.js';
import { createStatsRouter } from './routes/stats.js';
import { createVectorRouter } from './routes/vector.js';
import { createPhotosRouter } from './routes/photos.js';

export function createApp(options = {}) {
  const app = express();

  app.use(cors());
  app.use(createHealthRouter());
  app.use(createCenterlineRouter(options));
  app.use(createRasterRouter(options));
  app.use(createStatsRouter(options));
  app.use(createVectorRouter(options));
  app.use(createPhotosRouter(options));

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const { port } = getConfig();
  const app = createApp();

  app.listen(port, () => {
    console.log(`lancangriver service listening on ${port}`);
  });
}
