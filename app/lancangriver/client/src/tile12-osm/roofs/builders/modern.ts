import * as THREE from "three";
import { TileProjection } from "../../tile.js";
import * as helpers from "../_helpers.js";

const building_roof_building_factories__modern = (
  _roofprint: number[],
  features: GeoJSON.Feature,
  heightMeters: number,
  projection: TileProjection,
): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  const points =
    helpers.getFeatureRoofRings(features, heightMeters, projection)[0] ?? [];

  if (points.length < 3) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([], 2));
    return geometry;
  }

  const liftedPoints = points.map(
    ([x, y, z]) => [x, y + 3, z] as [number, number, number],
  );
  const centroid = helpers.calculateCentroid(points);

  const positions: number[] = [];
  const uvs: number[] = [];

  const addTriangle = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ) => {
    positions.push(a[0], a[1], a[2]);
    positions.push(b[0], b[1], b[2]);
    positions.push(c[0], c[1], c[2]);
    uvs.push(0, 0, 0, 0, 0, 0);
  };

  for (let i = 0; i < points.length; i += 1) {
    const next = (i + 1) % points.length;
    const baseA = points[i];
    const baseB = points[next];
    const liftedA = liftedPoints[i];
    const liftedB = liftedPoints[next];

    addTriangle(baseA, baseB, liftedA);
    addTriangle(baseB, liftedB, liftedA);
  }

  for (let i = 0; i < points.length; i += 1) {
    const next = (i + 1) % points.length;
    addTriangle(centroid, points[i], points[next]);
    addTriangle(centroid, liftedPoints[next], liftedPoints[i]);
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  return geometry;
};

export default building_roof_building_factories__modern;
