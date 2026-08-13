import * as THREE from "three";
import { TileProjection } from "../../tile";
import * as helpers from "../_helpers";

const building_roof_building_factories__fun = (
  _roofprint: number[],
  features: GeoJSON.Feature,
  heightMeters: number,
  projection: TileProjection,
) => {
  const geometry = new THREE.BufferGeometry();

  const rings = helpers.getFeatureRoofRings(features, heightMeters, projection);
  if (rings.length === 0) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([], 2));
    return geometry;
  }

  let points = rings[0];

  const centerScale = 0.2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const n = points.length;
  const roofHeightMeters = 4;
  const metersToUvScale = 0.1;

  // Calculate centroid
  const [cx, _cy, cz] = helpers.calculateCentroid(points);

  // Scale points 1.5x around centroid
  const scaledPoints: [number, number, number][] = points.map(([x, y, z]) => [
    cx + (x - cx) * centerScale,
    y + roofHeightMeters,
    cz + (z - cz) * centerScale,
  ]);

  points = points.map((p) => {
    return [cx + (p[0] - cx) * 1.2, p[1], cz + (p[2] - cz) * 1.2];
  });

  // Bottom face (fan triangulation from vertex 0)
  for (let i = 1; i < n - 1; i++) {
    positions.push(points[0][0], points[0][1], points[0][2]);
    positions.push(points[i][0], points[i][1], points[i][2]);
    positions.push(points[i + 1][0], points[i + 1][1], points[i + 1][2]);
    uvs.push(0, 0, 0, 0, 0, 0);
  }

  // Top face (fan triangulation from vertex n, reversed winding)
  for (let i = 1; i < n - 1; i++) {
    positions.push(scaledPoints[0][0], scaledPoints[0][1], scaledPoints[0][2]);
    positions.push(
      scaledPoints[i + 1][0],
      scaledPoints[i + 1][1],
      scaledPoints[i + 1][2],
    );
    positions.push(scaledPoints[i][0], scaledPoints[i][1], scaledPoints[i][2]);
    uvs.push(0, 0, 0, 0, 0, 0);
  }

  // Side faces (quads as two triangles)
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;

    // Triangle 1: bottom-i, bottom-next, top-i
    positions.push(points[i][0], points[i][1], points[i][2]);
    uvs.push(0, 0);

    positions.push(points[next][0], points[next][1], points[next][2]);
    uvs.push(helpers.distanceOf(points[i], points[next]) * metersToUvScale, 0);

    positions.push(scaledPoints[i][0], scaledPoints[i][1], scaledPoints[i][2]);
    uvs.push(
      0,
      helpers.distanceOf(scaledPoints[i], points[i]) * metersToUvScale,
    );

    // Triangle 2: bottom-next, top-next, top-i
    positions.push(points[next][0], points[next][1], points[next][2]);
    uvs.push(helpers.distanceOf(points[i], points[next]) * metersToUvScale, 0);

    positions.push(
      scaledPoints[next][0],
      scaledPoints[next][1],
      scaledPoints[next][2],
    );
    uvs.push(
      helpers.distanceOf(scaledPoints[i], scaledPoints[next]) * metersToUvScale,
      helpers.distanceOf(points[next], scaledPoints[next]) * metersToUvScale,
    );

    positions.push(scaledPoints[i][0], scaledPoints[i][1], scaledPoints[i][2]);
    uvs.push(
      0,
      helpers.distanceOf(points[i], scaledPoints[i]) * metersToUvScale,
    );
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  return geometry;
};

export default building_roof_building_factories__fun;
