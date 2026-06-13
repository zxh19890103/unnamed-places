import express from 'express';
import { getConfig } from './config.js';
import { createHealthRouter } from './routes/health.js';

export function createApp() {
  const app = express();

  app.use(createHealthRouter());

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const { port } = getConfig();
  const app = createApp();

  app.listen(port, () => {
    console.log(`lancangriver service listening on ${port}`);
  });
}
