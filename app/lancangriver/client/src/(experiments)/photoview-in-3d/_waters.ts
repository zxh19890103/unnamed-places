import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latLngToMetersOffset, LatLng } from './_fns';

const WATERWAY_WIDTHS: Record<string, number> = {
  river: 24,
  canal: 12,
  stream: 6,
  drain: 4,
  ditch: 4,
  tidal_channel: 16,
  brook: 5,
  default: 8,
};

const DEFAULT_WATER_COLOR = 0x2c6f8c;

function getWaterwayType(feature: GeoJSON.Feature): string {
  const props = feature.properties ?? {};
  const rawType = props.waterway ?? props.tags?.waterway ?? props.natural ?? props.tags?.natural ?? props.feature_type;
  if (typeof rawType === 'string') {
    return rawType.toLowerCase().split(';')[0].trim();
  }
  return 'default';
}

function getWaterwayWidth(type: string): number {
  return WATERWAY_WIDTHS[type] ?? WATERWAY_WIDTHS.default;
}

function createWaterRibbonGeometry(
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

function createPolygonWaterGeometry(
  rings: GeoJSON.Position[][],
  worldCenterLatlng: LatLng,
  elevationOffset: number,
): THREE.BufferGeometry | null {
  if (rings.length === 0 || rings[0].length < 3) return null;

  const outerRing = rings[0];
  const holeRings = rings.slice(1);

  const outerPoints2D: THREE.Vector2[] = [];
  const all3DPoints: THREE.Vector3[] = [];

  for (const [lng, lat] of outerRing) {
    const offset = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);
    outerPoints2D.push(new THREE.Vector2(offset.x, offset.z));
    all3DPoints.push(new THREE.Vector3(offset.x, elevationOffset, offset.z));
  }

  const holes2D: THREE.Vector2[][] = [];
  for (const hole of holeRings) {
    if (hole.length < 3) continue;
    const holePoints: THREE.Vector2[] = [];
    for (const [lng, lat] of hole) {
      const offset = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);
      holePoints.push(new THREE.Vector2(offset.x, offset.z));
      all3DPoints.push(new THREE.Vector3(offset.x, elevationOffset, offset.z));
    }
    holes2D.push(holePoints);
  }

  try {
    const faces = THREE.ShapeUtils.triangulateShape(outerPoints2D, holes2D);
    if (!faces || faces.length === 0) return null;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (const pt of all3DPoints) {
      positions.push(pt.x, pt.y, pt.z);
      normals.push(0, 1, 0);
      uvs.push(pt.x * 0.01, pt.z * 0.01);
    }

    for (const face of faces) {
      indices.push(face[0], face[1], face[2]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    return geometry;
  } catch (_e) {
    return null;
  }
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

function extractPolygonCoordinates(geometry: GeoJSON.Geometry): GeoJSON.Position[][][] {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates;
  }
  return [];
}

export function buildWatersGroup(
  collection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  elevationOffset = 0.3,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'osm-waters';

  const geometries: THREE.BufferGeometry[] = [];

  for (const feature of collection.features) {
    if (!feature.geometry) continue;

    const type = feature.geometry.type;

    if (type === 'LineString' || type === 'MultiLineString') {
      const lines = extractLineCoordinates(feature.geometry);
      const waterwayType = getWaterwayType(feature);
      const width = getWaterwayWidth(waterwayType);

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

        const ribbonGeom = createWaterRibbonGeometry(points, width);
        if (ribbonGeom) {
          geometries.push(ribbonGeom);
        }
      }
    } else if (type === 'Polygon' || type === 'MultiPolygon') {
      const polygonList = extractPolygonCoordinates(feature.geometry);
      for (const rings of polygonList) {
        const polyGeom = createPolygonWaterGeometry(rings, worldCenterLatlng, elevationOffset);
        if (polyGeom) {
          geometries.push(polyGeom);
        }
      }
    }
  }

  if (geometries.length > 0) {
    const merged = mergeGeometries(geometries, false);
    for (const geom of geometries) {
      geom.dispose();
    }

    if (merged) {
      const material = new THREE.MeshBasicMaterial({
        color: DEFAULT_WATER_COLOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: true,
      });

      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'waters-mesh';
      group.add(mesh);
    }
  }

  return group;
}

export function disposeWatersGroup(group: THREE.Group | null): void {
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
