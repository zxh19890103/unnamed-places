import * as THREE from "three";
import { TileProjection } from "../tile";

export function distanceOf(p0: number[], p1: number[]) {
  return Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]);
}

export function calculateCentroid(
  points: [number, number, number][],
): [number, number, number] {
  if (points.length === 0) {
    return [0, 0, 0];
  }

  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (const [x, y, z] of points) {
    cx += x;
    cy += y;
    cz += z;
  }

  return [cx / points.length, cy / points.length, cz / points.length];
}

export function lineNormals2D(
  p0: THREE.Vector2,
  p1: THREE.Vector2,
  left: THREE.Vector2,
  right: THREE.Vector2,
) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  const len = Math.hypot(dx, dy);

  if (len <= 1e-8) return false; // degenerate segment

  left.set(-dy / len, dx / len);
  right.set(dy / len, -dx / len);

  return true;
}

export function signedArea2D(points: THREE.Vector2[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    area += points[index].x * points[next].y - points[next].x * points[index].y;
  }

  return area * 0.5;
}

function pushTriangle(
  positions: number[],
  uvs: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
) {
  positions.push(a[0], a[1], a[2]);
  positions.push(b[0], b[1], b[2]);
  positions.push(c[0], c[1], c[2]);
  uvs.push(0, 0, 0, 0, 0, 0);
}

export function pushQuad(
  positions: number[],
  uvs: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
) {
  pushTriangle(positions, uvs, a, b, c);
  pushTriangle(positions, uvs, b, d, c);
}

export function toRingPoints3d(
  ring: GeoJSON.Position[],
  yMeters: number,
  projection: TileProjection,
): [number, number, number][] {
  const end = ring.length > 1 ? ring.length - 1 : ring.length;
  if (end < 3) {
    return [];
  }

  const points: [number, number, number][] = [];
  for (let index = 0; index < end; index += 1) {
    const { x, z } = projection.project(ring[index]);
    points.push([x, yMeters, z]);
  }

  return points;
}

export function getFeatureRoofRings(
  feature: GeoJSON.Feature,
  yMeters: number,
  projection: TileProjection,
): [number, number, number][][] {
  const geometry = feature.geometry;

  if (!geometry) {
    return [];
  }

  const rings =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.type === "MultiPolygon"
        ? (geometry.coordinates[0] ?? [])
        : [];

  if (rings.length === 0) {
    return [];
  }

  const mapped = rings
    .map((ring) => toRingPoints3d(ring, yMeters, projection))
    .filter((ring) => ring.length >= 3);

  if (mapped.length === 0) {
    return [];
  }

  return mapped;
}
