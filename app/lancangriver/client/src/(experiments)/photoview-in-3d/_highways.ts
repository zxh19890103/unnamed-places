import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latLngToMetersOffset, LatLng } from './_fns';

const HIGHWAY_WIDTHS: Record<string, number> = {
  motorway: 16,
  motorway_link: 10,
  trunk: 14,
  trunk_link: 8,
  primary: 12,
  primary_link: 7,
  secondary: 9,
  secondary_link: 6,
  tertiary: 7,
  tertiary_link: 5,
  unclassified: 5,
  residential: 5,
  service: 4,
  living_street: 4,
  pedestrian: 4,
  footway: 3,
  path: 2.5,
  track: 3.5,
};

const DEFAULT_HIGHWAY_WIDTH = 5;

const HIGHWAY_COLORS: Record<string, number> = {
  motorway: 0xff9900,
  motorway_link: 0xffaa33,
  trunk: 0xff9900,
  trunk_link: 0xffaa33,
  primary: 0xf5b041,
  primary_link: 0xf8c471,
  secondary: 0xf4d03f,
  secondary_link: 0xf7dc6f,
  tertiary: 0xfafafa,
  tertiary_link: 0xf2f3f4,
  residential: 0xd5d8dc,
  unclassified: 0xd5d8dc,
  service: 0xbdc3c7,
  default: 0xd5d8dc,
};

function getHighwayType(feature: GeoJSON.Feature): string {
  const props = feature.properties ?? {};
  const rawType = props.highway ?? props.tags?.highway ?? props.feature_type;
  if (typeof rawType === 'string') {
    return rawType.toLowerCase().split(';')[0].trim();
  }
  return 'unclassified';
}

function getHighwayWidth(type: string): number {
  return HIGHWAY_WIDTHS[type] ?? DEFAULT_HIGHWAY_WIDTH;
}

function getHighwayColor(type: string): number {
  return HIGHWAY_COLORS[type] ?? HIGHWAY_COLORS.default;
}

function createRoadRibbonGeometry(
  points: THREE.Vector3[],
  width: number,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;

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

  if (totalLength <= 0) return null;

  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const prevPoint = points[Math.max(0, i - 1)];
    const nextPoint = points[Math.min(points.length - 1, i + 1)];

    tangent.subVectors(nextPoint, prevPoint).normalize();
    if (tangent.lengthSq() === 0) {
      tangent.set(1, 0, 0);
    }

    side.set(-tangent.z, 0, tangent.x).normalize();
    if (side.lengthSq() === 0) {
      side.set(1, 0, 0);
    }

    const halfWidth = width / 2;
    left.copy(point).addScaledVector(side, halfWidth);
    right.copy(point).addScaledVector(side, -halfWidth);

    const v = cumulativeDistances[i] / totalLength;
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, v, 1, v);

    if (i < points.length - 1) {
      const leftIndex = i * 2;
      const rightIndex = i * 2 + 1;
      const nextLeftIndex = (i + 1) * 2;
      const nextRightIndex = (i + 1) * 2 + 1;

      indices.push(leftIndex, rightIndex, nextLeftIndex, rightIndex, nextRightIndex, nextLeftIndex);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

function extractLineCoordinates(geometry: GeoJSON.Geometry): GeoJSON.Position[][] {
  if (geometry.type === 'LineString') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates;
  }
  return [];
}

export function buildHighwaysGroup(
  collection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  elevationOffset = 1.0,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'osm-highways';

  const geometriesByColor = new Map<number, THREE.BufferGeometry[]>();

  for (const feature of collection.features) {
    if (!feature.geometry) continue;

    const lines = extractLineCoordinates(feature.geometry);
    if (lines.length === 0) continue;

    const highwayType = getHighwayType(feature);
    const width = getHighwayWidth(highwayType);
    const colorHex = getHighwayColor(highwayType);

    for (const line of lines) {
      if (line.length < 2) continue;

      const points = line.map(([lng, lat]) => {
        const offset = latLngToMetersOffset(
          lat,
          lng,
          worldCenterLatlng.lat,
          worldCenterLatlng.lng,
        );
        return new THREE.Vector3(offset.x, elevationOffset, offset.z);
      });

      const ribbonGeom = createRoadRibbonGeometry(points, width);
      if (ribbonGeom) {
        let bucket = geometriesByColor.get(colorHex);
        if (!bucket) {
          bucket = [];
          geometriesByColor.set(colorHex, bucket);
        }
        bucket.push(ribbonGeom);
      }
    }
  }

  for (const [colorHex, geometries] of geometriesByColor.entries()) {
    if (geometries.length === 0) continue;

    const merged = mergeGeometries(geometries, false);
    for (const geom of geometries) {
      geom.dispose();
    }

    if (!merged) continue;

    const material = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `highways-${colorHex.toString(16)}`;
    group.add(mesh);
  }

  return group;
}

export function disposeHighwaysGroup(group: THREE.Group | null): void {
  if (!group) return;

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        for (const mat of child.material) {
          mat.dispose();
        }
      } else if (child.material) {
        child.material.dispose();
      }
    }
  });

  group.clear();
}
