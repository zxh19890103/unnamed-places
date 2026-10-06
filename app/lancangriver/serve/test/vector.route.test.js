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
          properties: { name: 'sample' },
        },
      ],
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
        bbox: 'bad',
      },
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
        bbox: '181,10,182,11',
      },
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
        bbox: '-120,-95,-110,-91',
      },
    });
    expect(queryVectorFeatures).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox contains malformed numeric tokens', async () => {
    const malformedBboxes = [
      '101oops,19,102,20',
      '99,19x,101,21',
      '99,19,101.0abc,21',
      '99,19,101,2_1',
    ];

    for (const bbox of malformedBboxes) {
      const queryVectorFeatures = vi.fn();
      const app = createApp({ queryVectorFeatures });

      const response = await request(app).get('/vector').query({ bbox });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'INVALID_BBOX',
          reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
          bbox,
        },
      });
      expect(queryVectorFeatures).not.toHaveBeenCalled();
    }
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
        bbox: '99,19,101,21',
      },
    });
  });
});

describe('GET /vector/highways', () => {
  it('returns 200 and a FeatureCollection for a valid bbox', async () => {
    const featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'highway-1',
          geometry: { type: 'LineString', coordinates: [[100, 20], [100.1, 20.1]] },
          properties: { highway: 'primary' },
        },
      ],
    };

    const queryVectorFeaturesHighways = vi.fn().mockResolvedValue(featureCollection);
    const app = createApp({ queryVectorFeaturesHighways });

    const response = await request(app).get('/vector/highways').query({ bbox: '99,19,101,21' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual(featureCollection);
    expect(queryVectorFeaturesHighways).toHaveBeenCalledWith([99, 19, 101, 21]);
  });

  it('returns 400 when bbox is invalid', async () => {
    const queryVectorFeaturesHighways = vi.fn();
    const app = createApp({ queryVectorFeaturesHighways });

    const response = await request(app).get('/vector/highways').query({ bbox: 'bad' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: 'bad',
      },
    });
    expect(queryVectorFeaturesHighways).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox longitude is out of range', async () => {
    const queryVectorFeaturesHighways = vi.fn();
    const app = createApp({ queryVectorFeaturesHighways });

    const response = await request(app).get('/vector/highways').query({ bbox: '181,10,182,11' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: '181,10,182,11',
      },
    });
    expect(queryVectorFeaturesHighways).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox latitude is out of range', async () => {
    const queryVectorFeaturesHighways = vi.fn();
    const app = createApp({ queryVectorFeaturesHighways });

    const response = await request(app).get('/vector/highways').query({ bbox: '-120,-95,-110,-91' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: '-120,-95,-110,-91',
      },
    });
    expect(queryVectorFeaturesHighways).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox contains malformed numeric tokens', async () => {
    const malformedBboxes = [
      '101oops,19,102,20',
      '99,19x,101,21',
      '99,19,101.0abc,21',
      '99,19,101,2_1',
    ];

    for (const bbox of malformedBboxes) {
      const queryVectorFeaturesHighways = vi.fn();
      const app = createApp({ queryVectorFeaturesHighways });

      const response = await request(app).get('/vector/highways').query({ bbox });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'INVALID_BBOX',
          reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
          bbox,
        },
      });
      expect(queryVectorFeaturesHighways).not.toHaveBeenCalled();
    }
  });

  it('returns 500 JSON payload when the db adapter throws', async () => {
    const queryVectorFeaturesHighways = vi.fn().mockRejectedValue(new Error('db down'));
    const app = createApp({ queryVectorFeaturesHighways });

    const response = await request(app).get('/vector/highways').query({ bbox: '99,19,101,21' });

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'VECTOR_QUERY_FAILED',
        reason: 'Internal server error',
        bbox: '99,19,101,21',
      },
    });
  });
});

describe('GET /vector/waters', () => {
  it('returns 200 and a FeatureCollection for a valid bbox', async () => {
    const featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'water-1',
          geometry: { type: 'LineString', coordinates: [[100, 20], [100.1, 20.1]] },
          properties: { waterway: 'river' },
        },
      ],
    };

    const queryVectorFeaturesWaters = vi.fn().mockResolvedValue(featureCollection);
    const app = createApp({ queryVectorFeaturesWaters });

    const response = await request(app).get('/vector/waters').query({ bbox: '99,19,101,21' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual(featureCollection);
    expect(queryVectorFeaturesWaters).toHaveBeenCalledWith([99, 19, 101, 21]);
  });

  it('returns 400 when bbox is invalid', async () => {
    const queryVectorFeaturesWaters = vi.fn();
    const app = createApp({ queryVectorFeaturesWaters });

    const response = await request(app).get('/vector/waters').query({ bbox: 'bad' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: 'bad',
      },
    });
    expect(queryVectorFeaturesWaters).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox longitude is out of range', async () => {
    const queryVectorFeaturesWaters = vi.fn();
    const app = createApp({ queryVectorFeaturesWaters });

    const response = await request(app).get('/vector/waters').query({ bbox: '181,10,182,11' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: '181,10,182,11',
      },
    });
    expect(queryVectorFeaturesWaters).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox latitude is out of range', async () => {
    const queryVectorFeaturesWaters = vi.fn();
    const app = createApp({ queryVectorFeaturesWaters });

    const response = await request(app).get('/vector/waters').query({ bbox: '-120,-95,-110,-91' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_BBOX',
        reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
        bbox: '-120,-95,-110,-91',
      },
    });
    expect(queryVectorFeaturesWaters).not.toHaveBeenCalled();
  });

  it('returns 400 when bbox contains malformed numeric tokens', async () => {
    const malformedBboxes = [
      '101oops,19,102,20',
      '99,19x,101,21',
      '99,19,101.0abc,21',
      '99,19,101,2_1',
    ];

    for (const bbox of malformedBboxes) {
      const queryVectorFeaturesWaters = vi.fn();
      const app = createApp({ queryVectorFeaturesWaters });

      const response = await request(app).get('/vector/waters').query({ bbox });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'INVALID_BBOX',
          reason: 'Invalid bbox parameter. Expected minLon,minLat,maxLon,maxLat',
          bbox,
        },
      });
      expect(queryVectorFeaturesWaters).not.toHaveBeenCalled();
    }
  });

  it('returns 500 JSON payload when the db adapter throws', async () => {
    const queryVectorFeaturesWaters = vi.fn().mockRejectedValue(new Error('db down'));
    const app = createApp({ queryVectorFeaturesWaters });

    const response = await request(app).get('/vector/waters').query({ bbox: '99,19,101,21' });

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'VECTOR_QUERY_FAILED',
        reason: 'Internal server error',
        bbox: '99,19,101,21',
      },
    });
  });
});
