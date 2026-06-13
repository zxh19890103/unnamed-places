import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

describe('GET /vector', () => {
  it('returns 200 and a FeatureCollection for a valid bbox', async () => {
    const featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'feature-1',
          geometry: { type: 'Point', coordinates: [100, 20] },
          properties: { name: 'sample' }
        }
      ]
    };

    const queryVectorFeatures = vi.fn().mockResolvedValue(featureCollection);
    const app = createApp({ queryVectorFeatures });

    const response = await request(app).get('/vector').query({ bbox: '99,19,101,21' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual(featureCollection);
    expect(queryVectorFeatures).toHaveBeenCalledWith([99, 19, 101, 21]);
  });

  it('returns 400 when bbox is invalid', async () => {
    const queryVectorFeatures = vi.fn();
    const app = createApp({ queryVectorFeatures });

    const response = await request(app).get('/vector').query({ bbox: 'bad' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: 'bad'
      }
    });
    expect(queryVectorFeatures).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox longitude is out of range', async () => {
    const queryVectorFeatures = vi.fn();
    const app = createApp({ queryVectorFeatures });

    const response = await request(app).get('/vector').query({ bbox: '181,10,182,11' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: '181,10,182,11'
      }
    });
    expect(queryVectorFeatures).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox latitude is out of range', async () => {
    const queryVectorFeatures = vi.fn();
    const app = createApp({ queryVectorFeatures });

    const response = await request(app).get('/vector').query({ bbox: '-120,-95,-110,-91' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: '-120,-95,-110,-91'
      }
    });
    expect(queryVectorFeatures).not.toHaveBeenCalled();
  });

  it('returns 500 JSON payload when the db adapter throws', async () => {
    const queryVectorFeatures = vi.fn().mockRejectedValue(new Error('db down'));
    const app = createApp({ queryVectorFeatures });

    const response = await request(app).get('/vector').query({ bbox: '99,19,101,21' });

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'VECTOR_QUERY_FAILED',
        reason: 'Internal server error',
        bbox: '99,19,101,21'
      }
    });
  });
});
