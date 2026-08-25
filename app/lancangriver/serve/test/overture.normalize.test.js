import { describe, expect, it } from 'vitest';

import { normalizeOvertureFeatures } from '../src/jobs/overtureNormalize.js';

describe('normalizeOvertureFeatures', () => {
  it('maps overture features to shared vector schema', () => {
    const normalized = normalizeOvertureFeatures([
      {
        type: 'Feature',
        id: 'abc123',
        properties: { class: 'building' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [100, 20],
              [100.1, 20],
              [100.1, 20.1],
              [100, 20],
            ],
          ],
        },
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      source: 'overture',
      feature_id: 'overture/abc123',
      feature_type: 'Polygon',
      tags: { class: 'building' },
    });
  });

  it('drops unsupported geometry types', () => {
    const normalized = normalizeOvertureFeatures([
      {
        type: 'Feature',
        id: 'bad-1',
        properties: {},
        geometry: {
          type: 'GeometryCollection',
          geometries: [],
        },
      },
    ]);

    expect(normalized).toHaveLength(0);
  });
});
