import './env.js';
import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { createHealthRouter } from './routes/health.js';
import { createRasterRouter } from './routes/raster.js';
import { createVectorRouter } from './routes/vector.js';

export function createApp(options = {}) {
  const app = express();

  app.use(cors());
  app.use(createHealthRouter());
  app.use(createRasterRouter(options));
  app.use(createVectorRouter(options));

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const { port } = getConfig();
  const app = createApp();

  app.listen(port, () => {
    console.log(`lancangriver service listening on ${port}`);
  });
}
