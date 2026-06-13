import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

describe('GET /health', () => {
  it('returns 200 and status ok payload', async () => {
    const app = createApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 404 for unknown route', async () => {
    const app = createApp();

    const response = await request(app).get('/not-found');

    expect(response.status).toBe(404);
  });
});
