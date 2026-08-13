import * as THREE from "three";
import { getHighwayWidthMeters, HIGHWAY_WIDTH_METERS_SCALE } from "./base";
import { TileProjection } from "../tile";
import { HighwayGeometryEntry } from "./_types";
import { uniformSettings } from "../_cfg";

function createRoadRibbonGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  width: number,
  segments: number,
): THREE.BufferGeometry {
  const sampleCount = Math.max(2, segments);
  const points = curve.getSpacedPoints(sampleCount);

  if (points.length < 2) {
    return new THREE.BufferGeometry();
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const cumulativeDistances = [0];
  let totalLength = 0;

  for (let i = 1; i < points.length; i += 1) {
    totalLength += points[i - 1].distanceTo(points[i]);
    cumulativeDistances.push(totalLength);
  }

  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const prevPoint = points[Math.max(0, i - 1)];
    const nextPoint = points[Math.min(points.length - 1, i + 1)];

    tangent.subVectors(nextPoint, prevPoint).normalize();
    if (!tangent.lengthSq()) {
      tangent.set(1, 0, 0);
    }

    side.set(-tangent.z, 0, tangent.x).normalize();
    if (!side.lengthSq()) {
      side.set(1, 0, 0);
    }

    const halfWidth = width / 2;
    left.copy(point).addScaledVector(side, halfWidth);
    right.copy(point).addScaledVector(side, -halfWidth);

    const v = totalLength > 0 ? cumulativeDistances[i] / totalLength : 0;
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(1, v, 0, v);

    if (i < points.length - 1) {
      const leftIndex = i * 2;
      const rightIndex = i * 2 + 1;
      const nextLeftIndex = (i + 1) * 2;
      const nextRightIndex = (i + 1) * 2 + 1;

      indices.push(
        leftIndex,
        rightIndex,
        nextLeftIndex,
        rightIndex,
        nextRightIndex,
        nextLeftIndex,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

function addHighwaySegment(
  points: THREE.Vector3[],
  widthMeters: number,
  tileExtent: THREE.Vector2,
): THREE.BufferGeometry | null {
  const distance = points.reduce((sum, point, index) => {
    if (!points[index + 1]) return sum;
    return sum + point.distanceTo(points[index + 1]);
  }, 0);

  if (!Number.isFinite(distance) || distance <= 0) {
    return null;
  }

  const path = new THREE.CatmullRomCurve3(points, false, "catmullrom");

  const visualWidth = widthMeters * HIGHWAY_WIDTH_METERS_SCALE;
  const segmentCount = Math.max(12, Math.ceil(distance / 2));
  const geometry = createRoadRibbonGeometry(path, visualWidth, segmentCount);
  const positionAttr = geometry.attributes.position;

  const gisUv = new Float32Array(positionAttr.count * 2);
  for (let i = 0; i < positionAttr.count; i += 1) {
    const x = positionAttr.getX(i);
    const z = positionAttr.getZ(i);

    const rawU = THREE.MathUtils.clamp(x / tileExtent.x + 0.5, 0, 1);
    const rawV = THREE.MathUtils.clamp(-z / tileExtent.y + 0.5, 0, 1);

    const u =
      Math.round(rawU * uniformSettings.GROUND_UV_GRID_SIZE) /
      uniformSettings.GROUND_UV_GRID_SIZE;
    const v =
      Math.round(rawV * uniformSettings.GROUND_UV_GRID_SIZE) /
      uniformSettings.GROUND_UV_GRID_SIZE;

    gisUv[i * 2 + 0] = u;
    gisUv[i * 2 + 1] = v;
  }

  geometry.setAttribute("gisUv", new THREE.BufferAttribute(gisUv, 2));
  return geometry;
}

export function createHighwayGeometry(
  feature: GeoJSON.Feature,
  coordinates: GeoJSON.Position[],
  projection: TileProjection,
): HighwayGeometryEntry[] {
  if (coordinates.length < 2) {
    return [];
  }

  const widthMeters = getHighwayWidthMeters(feature);
  const geometries: HighwayGeometryEntry[] = [];

  const points = coordinates.map((coord) => {
    const xz = projection.project(coord);
    return new THREE.Vector3(xz.x, 0, xz.z);
  });

  const geometry = addHighwaySegment(
    points,
    widthMeters,
    new THREE.Vector2(projection.widthMeters, projection.heightMeters),
  );

  if (geometry) {
    const offGroundMeters = 0; // getHighwayOffGroundMeters(feature);
    geometry.translate(0, offGroundMeters, 0);
    geometries.push({
      offGroundMeters,
      geometry,
      widthMeters,
      centerline: points,
    });
  }

  return geometries;
}
