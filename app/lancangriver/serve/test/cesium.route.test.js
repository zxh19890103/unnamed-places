import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

describe('GET /cesium/reverse-geocode', () => {
  it('returns 200 and the reverse geocode payload for valid coordinates', async () => {
    const reverseGeocode = vi.fn().mockResolvedValue({
      features: [{ properties: { label: 'Paris' } }]
    });
    const app = createApp({ reverseGeocode });

    const response = await request(app).get('/cesium/reverse-geocode').query({ lat: '48.8566', lng: '2.3522' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      features: [{ properties: { label: 'Paris' } }]
    });
    expect(reverseGeocode).toHaveBeenCalledWith({ latitude: 48.8566, longitude: 2.3522 });
  });

  it('returns 400 when coordinates are missing or invalid', async () => {
    const reverseGeocode = vi.fn();
    const app = createApp({ reverseGeocode });

    const response = await request(app).get('/cesium/reverse-geocode');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_COORDINATES');
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it('returns 500 when reverse geocoding fails', async () => {
    const reverseGeocode = vi.fn().mockRejectedValue(new Error('boom'));
    const app = createApp({ reverseGeocode });

    const response = await request(app).get('/cesium/reverse-geocode').query({ lat: '48.8566', lng: '2.3522' });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('REVERSE_GEOCODE_FAILED');
  });
});
