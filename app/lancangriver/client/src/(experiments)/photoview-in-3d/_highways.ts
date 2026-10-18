import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latLngToMetersOffset, LatLng } from './_fns';
import { DemAtlas } from './_demAtlas';

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
export const DEFAULT_HIGHWAY_ELEVATION_OFFSET = 6.0;
const MAX_SEGMENT_LENGTH_METERS = 30;

const HIGHWAY_COLORS: Record<string, number> = {
  motorway: 0xf94144, // vivid red
  motorway_link: 0xf3722c, // orange-red
  trunk: 0xf9844a, // warm orange
  trunk_link: 0xf9c74f, // golden amber
  primary: 0xf8961e, // strong orange
  primary_link: 0xfab75a, // soft amber
  secondary: 0xe76f51, // coral red-orange
  secondary_link: 0xf4a261, // salmon orange
  tertiary: 0xffd166, // warm yellow
  tertiary_link: 0xffe29a, // pale golden
  residential: 0xf7d9c4, // warm blush
  unclassified: 0xfce7d7, // pale sand
  service: 0xe9b8a5, // muted rose
  default: 0xf7e0d2, // warm ivory
};

const highwayVertexShader = /* glsl */ `
  uniform sampler2D demAtlas;
  uniform float demMedian;
  uniform float elevationOffset;

  attribute vec2 demUv;
  attribute float aSkirtDrop;

  varying vec2 vUv;
  varying float vSkirtDrop;

  void main() {
    vUv = uv;
    vSkirtDrop = aSkirtDrop;
    vec2 clampedUv = clamp(demUv, 0.0, 1.0);
    float elevation = texture2D(demAtlas, clampedUv).r;
    float raise = elevation - demMedian;

    vec3 pos = position;
    pos.y += raise + elevationOffset - aSkirtDrop;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const highwayFragmentShader = /* glsl */ `
  uniform vec3 diffuseColor;
  varying vec2 vUv;
  varying float vSkirtDrop;

  void main() {
    vec3 col = diffuseColor;
    if (vSkirtDrop > 0.01) {
      col *= 0.65;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

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

function subdivideCoordinates(
  line: GeoJSON.Position[],
  maxDistance = MAX_SEGMENT_LENGTH_METERS,
): GeoJSON.Position[] {
  if (line.length < 2) return line;

  const result: GeoJSON.Position[] = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const p1 = line[i];
    const p2 = line[i + 1];
    result.push(p1);

    const dLng = p2[0] - p1[0];
    const dLat = p2[1] - p1[1];
    const avgLatRad = ((p1[1] + p2[1]) * 0.5 * Math.PI) / 180;
    const metersLng = dLng * 111320 * Math.cos(avgLatRad);
    const metersLat = dLat * 110574;
    const distanceMeters = Math.hypot(metersLng, metersLat);

    if (distanceMeters > maxDistance) {
      const steps = Math.ceil(distanceMeters / maxDistance);
      for (let s = 1; s < steps; s += 1) {
        const t = s / steps;
        result.push([p1[0] + dLng * t, p1[1] + dLat * t]);
      }
    }
  }

  result.push(line[line.length - 1]);
  return result;
}

function createRoadRibbonGeometry(
  points: THREE.Vector3[],
  width: number,
  demAtlas?: DemAtlas,
  worldCenterLatlng?: LatLng,
  elevationOffset = DEFAULT_HIGHWAY_ELEVATION_OFFSET,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const demUvs: number[] = [];
  const aSkirtDrops: number[] = [];
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

  // Cache left and right edge coordinates for constructing side skirts
  const leftEdgePoints: {
    x: number;
    z: number;
    outwardX: number;
    outwardZ: number;
    demUv: { u: number; v: number };
  }[] = [];
  const rightEdgePoints: {
    x: number;
    z: number;
    outwardX: number;
    outwardZ: number;
    demUv: { u: number; v: number };
  }[] = [];

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
    aSkirtDrops.push(0.0, 0.0);

    const leftUv =
      demAtlas && worldCenterLatlng
        ? demAtlas.getDemUvFromOffset(left.x, left.z, worldCenterLatlng)
        : { u: 0, v: 0 };
    const rightUv =
      demAtlas && worldCenterLatlng
        ? demAtlas.getDemUvFromOffset(right.x, right.z, worldCenterLatlng)
        : { u: 0, v: 0 };

    demUvs.push(leftUv.u, leftUv.v, rightUv.u, rightUv.v);

    leftEdgePoints.push({
      x: left.x,
      z: left.z,
      outwardX: side.x,
      outwardZ: side.z,
      demUv: leftUv,
    });
    rightEdgePoints.push({
      x: right.x,
      z: right.z,
      outwardX: -side.x,
      outwardZ: -side.z,
      demUv: rightUv,
    });

    if (i < points.length - 1) {
      const leftIndex = i * 2;
      const rightIndex = i * 2 + 1;
      const nextLeftIndex = (i + 1) * 2;
      const nextRightIndex = (i + 1) * 2 + 1;

      indices.push(leftIndex, rightIndex, nextLeftIndex, rightIndex, nextRightIndex, nextLeftIndex);
    }
  }

  // --- Add Sloped Embankment Skirts along left and right shoulders ---
  const flareDistance = Math.min(width * 0.8, 8.0);

  const addShoulderSkirt = (
    edgePts: {
      x: number;
      z: number;
      outwardX: number;
      outwardZ: number;
      demUv: { u: number; v: number };
    }[],
  ) => {
    const edgeStartIndex = positions.length / 3;
    for (let i = 0; i < edgePts.length; i += 1) {
      const pt = edgePts[i];
      // Top vertex (elevated surface level)
      positions.push(pt.x, 0, pt.z);
      normals.push(0, 1, 0);
      uvs.push(0, 0);
      demUvs.push(pt.demUv.u, pt.demUv.v);
      aSkirtDrops.push(0.0);

      // Bottom vertex pushed outward along (outwardX, outwardZ) to meet terrain
      const botX = pt.x + pt.outwardX * flareDistance;
      const botZ = pt.z + pt.outwardZ * flareDistance;
      const botUv =
        demAtlas && worldCenterLatlng
          ? demAtlas.getDemUvFromOffset(botX, botZ, worldCenterLatlng)
          : pt.demUv;

      positions.push(botX, 0, botZ);
      normals.push(0, 1, 0);
      uvs.push(0, 0);
      demUvs.push(botUv.u, botUv.v);
      aSkirtDrops.push(elevationOffset);
    }

    for (let i = 0; i < edgePts.length - 1; i += 1) {
      const topCurr = edgeStartIndex + i * 2;
      const botCurr = topCurr + 1;
      const topNext = edgeStartIndex + (i + 1) * 2;
      const botNext = topNext + 1;

      // Double-sided quad faces
      indices.push(topCurr, botCurr, topNext);
      indices.push(botCurr, botNext, topNext);
      indices.push(topCurr, topNext, botCurr);
      indices.push(botCurr, topNext, botNext);
    }
  };

  addShoulderSkirt(leftEdgePoints);
  addShoulderSkirt(rightEdgePoints);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('demUv', new THREE.Float32BufferAttribute(demUvs, 2));
  geometry.setAttribute('aSkirtDrop', new THREE.Float32BufferAttribute(aSkirtDrops, 1));
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
  demAtlas: DemAtlas,
  elevationOffset = DEFAULT_HIGHWAY_ELEVATION_OFFSET,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'osm-highways';

  const geometriesByColor = new Map<number, THREE.BufferGeometry[]>();

  for (const feature of collection.features) {
    if (!feature.geometry) continue;

    const rawLines = extractLineCoordinates(feature.geometry);
    if (rawLines.length === 0) continue;

    const highwayType = getHighwayType(feature);
    const width = getHighwayWidth(highwayType);
    const colorHex = getHighwayColor(highwayType);

    for (const rawLine of rawLines) {
      if (rawLine.length < 2) continue;

      const line = subdivideCoordinates(rawLine);

      const points = line.map(([lng, lat]) => {
        const offset = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);
        return new THREE.Vector3(offset.x, 0, offset.z);
      });

      const ribbonGeom = createRoadRibbonGeometry(
        points,
        width,
        demAtlas,
        worldCenterLatlng,
        elevationOffset,
      );
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

    const material = new THREE.ShaderMaterial({
      uniforms: {
        demAtlas: demAtlas ? demAtlas.textureUniform : { value: new THREE.Texture() },
        demMedian: demAtlas ? demAtlas.demMedianUniform : { value: 0 },
        elevationOffset: { value: elevationOffset },
        diffuseColor: { value: new THREE.Color(colorHex) },
      },
      vertexShader: highwayVertexShader,
      fragmentShader: highwayFragmentShader,
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
