import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

describe('GET /geo/centerline', () => {
  it('returns 200 and serves centerline geojson', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-centerline-'));

    try {
      const centerlinePath = join(tempRoot, 'centerline.geojson');
      const featureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'test-centerline' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [100.0, 22.0],
                [100.1, 22.1]
              ]
            }
          }
        ]
      };

      await writeFile(centerlinePath, JSON.stringify(featureCollection), 'utf8');

      const app = createApp({ centerlineGeojsonPath: centerlinePath });
      const response = await request(app).get('/geo/centerline');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual(featureCollection);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns 404 when centerline file does not exist', async () => {
    const app = createApp({ centerlineGeojsonPath: '/tmp/does-not-exist-centerline.geojson' });
    const response = await request(app).get('/geo/centerline');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'CENTERLINE_NOT_FOUND',
        reason: 'Centerline GeoJSON file was not found'
      }
    });
  });
});

describe('GET /geo/tiles-manifest', () => {
  it('returns 200 and serves tile manifest json', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lancangriver-tiles-manifest-'));

    try {
      const manifestPath = join(tempRoot, 'z11_manifest.json');
      const manifest = [
        { z: 11, x: 1584, y: 852 },
        { z: 11, x: 1584, y: 853 }
      ];

      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

      const app = createApp({ tilesManifestPath: manifestPath });
      const response = await request(app).get('/geo/tiles-manifest');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual(manifest);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns 404 when tile manifest file does not exist', async () => {
    const app = createApp({ tilesManifestPath: '/tmp/does-not-exist-z11-manifest.json' });
    const response = await request(app).get('/geo/tiles-manifest');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'TILES_MANIFEST_NOT_FOUND',
        reason: 'Tiles manifest file was not found'
      }
    });
  });
});