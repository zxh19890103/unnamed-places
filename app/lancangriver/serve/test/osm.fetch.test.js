import { describe, expect, it } from 'vitest';
import { fetchOsmHighwayFeaturesForZ12Key, toFeatureFromElement } from '../src/jobs/osmFetch.js';

describe('toFeatureFromElement', () => {
  it('maps relation with one outer ring to Polygon', () => {
    const relation = {
      type: 'relation',
      id: 100,
      tags: { type: 'multipolygon', natural: 'water' },
      members: [
        {
          type: 'way',
          role: 'outer',
          geometry: [
            { lon: 100, lat: 20 },
            { lon: 101, lat: 20 },
            { lon: 101, lat: 21 },
            { lon: 100, lat: 20 }
          ]
        }
      ]
    };

    const feature = toFeatureFromElement(relation);

    expect(feature).toBeTruthy();
    expect(feature.feature_id).toBe('relation/100');
    expect(feature.feature_type).toBe('Polygon');
    expect(feature.geometry.type).toBe('Polygon');
    expect(feature.geometry.coordinates[0].length).toBe(4);
  });

  it('maps relation with multiple outers to MultiPolygon', () => {
    const relation = {
      type: 'relation',
      id: 200,
      tags: { type: 'multipolygon', building: 'yes' },
      members: [
        {
          type: 'way',
          role: 'outer',
          geometry: [
            { lon: 100, lat: 20 },
            { lon: 100.5, lat: 20 },
            { lon: 100.5, lat: 20.5 },
            { lon: 100, lat: 20 }
          ]
        },
        {
          type: 'way',
          role: 'outer',
          geometry: [
            { lon: 101, lat: 21 },
            { lon: 101.5, lat: 21 },
            { lon: 101.5, lat: 21.5 },
            { lon: 101, lat: 21 }
          ]
        }
      ]
    };

    const feature = toFeatureFromElement(relation);

    expect(feature).toBeTruthy();
    expect(feature.feature_id).toBe('relation/200');
    expect(feature.feature_type).toBe('MultiPolygon');
    expect(feature.geometry.type).toBe('MultiPolygon');
    expect(feature.geometry.coordinates.length).toBe(2);
  });
});

describe('fetchOsmHighwayFeaturesForZ12Key', () => {
  it('sends a highway overpass query and maps way geometry to features', async () => {
    const postFormJson = async (_endpoint, formValues) => {
      expect(formValues.data).toContain('way["highway"]');
      expect(formValues.data).toContain('relation["highway"]');

      return {
        elements: [
          {
            type: 'way',
            id: 77,
            tags: { highway: 'residential' },
            geometry: [
              { lon: 100, lat: 20 },
              { lon: 100.1, lat: 20.1 }
            ]
          }
        ]
      };
    };

    const features = await fetchOsmHighwayFeaturesForZ12Key('12/3456/1523', {
      postFormJson,
      logger: { info: () => { } }
    });

    expect(features).toHaveLength(1);
    expect(features[0].feature_id).toBe('way/77');
    expect(features[0].feature_type).toBe('LineString');
    expect(features[0].tags.highway).toBe('residential');
  });
});
