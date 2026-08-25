import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createHighwayGeometry } from './index.js';

describe('createHighwayGeometry', () => {
  it('builds a flat ribbon mesh from a strongly curved centerline', () => {
    const feature = {
      type: 'Feature',
      properties: { highway: 'residential' },
    } as unknown as GeoJSON.Feature;

    const projection = {
      widthMeters: 200,
      heightMeters: 200,
      project: (coord: GeoJSON.Position) => ({
        x: coord[0] * 10,
        z: coord[1] * 10,
      }),
    } as any;

    const strongCurve = [
      [0, 0],
      [5, 2],
      [10, 8],
      [15, 12],
      [20, 12],
    ] as GeoJSON.Position[];

    const entries = createHighwayGeometry(feature, strongCurve, projection);

    expect(entries).toHaveLength(1);

    const geometry = entries[0].geometry;
    const positionAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;

    expect(positionAttr.count).toBeGreaterThan(0);
    expect(normalAttr.count).toBe(positionAttr.count);
    expect(uvAttr.count).toBeGreaterThan(0);

    const firstNormal = new THREE.Vector3(
      normalAttr.getX(0),
      normalAttr.getY(0),
      normalAttr.getZ(0),
    );

    expect(firstNormal.y).toBeGreaterThan(0.9);
    expect(geometry.index).not.toBeNull();
  });
});
