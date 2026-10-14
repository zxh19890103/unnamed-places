import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latLngToMetersOffset, LatLng } from './_fns';
import { DemAtlas } from './_demAtlas';
import { SolarUniforms } from './_solar.js';

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

const DEFAULT_WATER_COLOR = '#0d5966';
const MAX_SEGMENT_LENGTH_METERS = 30;
const WATER_WIDTH_SCALE = 2;
const DEFAULT_WATER_ELEVATION_OFFSET = 5.0;

let cachedWaterNormalTexture: THREE.Texture | null = null;

export function getWaterNormalTexture(textureLoader?: THREE.TextureLoader): THREE.Texture {
  if (cachedWaterNormalTexture) {
    return cachedWaterNormalTexture;
  }

  const loader = textureLoader ?? new THREE.TextureLoader();
  const texture = loader.load('/textures/waternormals.jpg');
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  cachedWaterNormalTexture = texture;
  return texture;
}

const waterVertexShader = /* glsl */ `
  uniform sampler2D demAtlas;
  uniform float demMedian;
  uniform float elevationOffset;

  attribute vec2 demUv;
  attribute float aShoreT;
  attribute float aSkirtDrop;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying float vShoreT;
  varying float vSkirtDrop;

  void main() {
    vUv = uv;
    vShoreT = aShoreT;
    vSkirtDrop = aSkirtDrop;
    vec2 clampedUv = clamp(demUv, 0.0, 1.0);
    float elevation = texture2D(demAtlas, clampedUv).r;
    float raise = elevation - demMedian;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    worldPosition.y += raise + elevationOffset - aSkirtDrop;

    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const waterFragmentShader = /* glsl */ `
  uniform vec3 diffuseColor;
  uniform float opacity;
  uniform sampler2D normalSampler;
  uniform float uTime;
  uniform vec3 sunDirection;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying float vShoreT;
  varying float vSkirtDrop;

  void main() {
    // World space horizontal coordinates for consistent ripple scale across tiles
    vec2 flowUv = vWorldPosition.xz * 0.001;

    // Dual-layer scrolling normals for natural, gentle river current
    vec2 flowOffset1 = vec2(uTime * 0.015, uTime * 0.010);
    vec2 flowOffset2 = vec2(-uTime * 0.012, 0.0);

    vec3 normalSample1 = texture2D(normalSampler, flowUv + flowOffset1).rgb * 2.0 - 1.0;
    vec3 normalSample2 = texture2D(normalSampler, flowUv * 1.4 + flowOffset2).rgb * 2.0 - 1.0;
    vec3 rawNormal = normalize(normalSample1 + normalSample2);

    // Blend tangent ripple normal into world-space up normal (0, 1, 0)
    // Gentle wave strength keeps the surface calm like a river rather than ocean waves
    float waveStrength = 1.6;
    vec3 worldNormal = normalize(vec3(rawNormal.x * waveStrength, 1.0, rawNormal.y * waveStrength));

    // Direction vectors
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 lightDir = normalize(sunDirection);

    // Subtle diffuse variation
    float NdotL = max(0.0, dot(worldNormal, lightDir));
    vec3 baseColor = diffuseColor * (0.85 + 0.3 * NdotL);

    // Shore distance calculation: 0.0 at shore edges, 1.0 at river centerline
    float shoreDistance = 1.0 - clamp(vShoreT, 0.0, 1.0);

    // Blend base color toward dark shore color within the outer 30% of the ribbon width (shoreDistance in [0.0, 0.3])
    float shoreFactor = 1.0 - smoothstep(0.0, 0.3, shoreDistance);
    vec3 shoreColor = vec3(0.95, 0.97, 0.98);
    baseColor = mix(baseColor, shoreColor, shoreFactor);

    // Darken vertical skirts toward deeper shoreline tone as they drop down
    if (vSkirtDrop > 0.01) {
      float dropFactor = clamp(vSkirtDrop / 10.0, 0.0, 1.0);
      vec3 deepSkirtColor = diffuseColor * 0.55;
      baseColor = mix(baseColor, deepSkirtColor, dropFactor);
    }

    // Blinn-Phong specular highlight
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotH = max(0.0, dot(worldNormal, halfVec));
    float specular = pow(NdotH, 48.0) * 0.5;

    // Subtle Fresnel term for edge sheen
    float fresnel = pow(1.0 - max(0.0, dot(worldNormal, viewDir)), 2.0);

    // Final water color composition
    vec3 finalColor = baseColor + vec3(1.0, 0.98, 0.92) * specular + vec3(0.1, 0.18, 0.22) * (fresnel * 0.35);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function getWaterwayType(feature: GeoJSON.Feature): string {
  const props = feature.properties ?? {};
  const rawType =
    props.waterway ??
    props.tags?.waterway ??
    props.natural ??
    props.tags?.natural ??
    props.feature_type;
  if (typeof rawType === 'string') {
    return rawType.toLowerCase().split(';')[0].trim();
  }
  return 'default';
}

function getWaterwayWidth(type: string): number {
  return WATERWAY_WIDTHS[type] ?? WATERWAY_WIDTHS.default;
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

function createWaterRibbonGeometry(
  points: THREE.Vector3[],
  width: number,
  demAtlas?: DemAtlas,
  worldCenterLatlng?: LatLng,
  elevationOffset = DEFAULT_WATER_ELEVATION_OFFSET,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const demUvs: number[] = [];
  const aShoreTs: number[] = [];
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

  // Cache left and right ribbon edge points to construct side skirts
  const leftEdgePoints: { x: number; z: number; demUv: { u: number; v: number } }[] = [];
  const rightEdgePoints: { x: number; z: number; demUv: { u: number; v: number } }[] = [];

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

    const halfWidth = (WATER_WIDTH_SCALE * width) / 2;
    left.copy(point).addScaledVector(side, halfWidth);
    right.copy(point).addScaledVector(side, -halfWidth);

    const v = cumulativeDistances[i] / totalLength;
    positions.push(left.x, left.y, left.z, point.x, point.y, point.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(0, v, 0.5, v, 1, v);
    aShoreTs.push(1.0, 0.0, 1.0);
    aSkirtDrops.push(0.0, 0.0, 0.0);

    const leftUv =
      demAtlas && worldCenterLatlng
        ? demAtlas.getDemUvFromOffset(left.x, left.z, worldCenterLatlng)
        : { u: 0, v: 0 };
    const centerUv =
      demAtlas && worldCenterLatlng
        ? demAtlas.getDemUvFromOffset(point.x, point.z, worldCenterLatlng)
        : { u: 0, v: 0 };
    const rightUv =
      demAtlas && worldCenterLatlng
        ? demAtlas.getDemUvFromOffset(right.x, right.z, worldCenterLatlng)
        : { u: 0, v: 0 };

    demUvs.push(leftUv.u, leftUv.v, centerUv.u, centerUv.v, rightUv.u, rightUv.v);

    leftEdgePoints.push({ x: left.x, z: left.z, demUv: leftUv });
    rightEdgePoints.push({ x: right.x, z: right.z, demUv: rightUv });

    if (i < points.length - 1) {
      const i0 = i * 3;
      const i1 = i * 3 + 1;
      const i2 = i * 3 + 2;
      const next0 = (i + 1) * 3;
      const next1 = (i + 1) * 3 + 1;
      const next2 = (i + 1) * 3 + 2;

      // Left quad (Left to Center)
      indices.push(i0, i1, next0, i1, next1, next0);
      // Right quad (Center to Right)
      indices.push(i1, i2, next1, i2, next2, next1);
    }
  }

  // --- Add Vertical Skirts along both ribbon edges (left and right shores) ---
  const addShoreSkirt = (edgePts: typeof leftEdgePoints) => {
    const edgeStartIndex = positions.length / 3;
    for (let i = 0; i < edgePts.length; i += 1) {
      const pt = edgePts[i];
      // Top vertex (stays at elevationOffset)
      positions.push(pt.x, 0, pt.z);
      normals.push(0, 1, 0);
      uvs.push(pt.x * 0.01, pt.z * 0.01);
      demUvs.push(pt.demUv.u, pt.demUv.v);
      aShoreTs.push(1.0);
      aSkirtDrops.push(0.0);

      // Bottom vertex (drops by elevationOffset to terrain)
      positions.push(pt.x, 0, pt.z);
      normals.push(0, 1, 0);
      uvs.push(pt.x * 0.01, pt.z * 0.01);
      demUvs.push(pt.demUv.u, pt.demUv.v);
      aShoreTs.push(1.0);
      aSkirtDrops.push(elevationOffset);
    }

    for (let i = 0; i < edgePts.length - 1; i += 1) {
      const topCurr = edgeStartIndex + i * 2;
      const botCurr = topCurr + 1;
      const topNext = edgeStartIndex + (i + 1) * 2;
      const botNext = topNext + 1;

      // Double-sided quad
      indices.push(topCurr, botCurr, topNext);
      indices.push(botCurr, botNext, topNext);
      indices.push(topCurr, topNext, botCurr);
      indices.push(botCurr, topNext, botNext);
    }
  };

  addShoreSkirt(leftEdgePoints);
  addShoreSkirt(rightEdgePoints);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('demUv', new THREE.Float32BufferAttribute(demUvs, 2));
  geometry.setAttribute('aShoreT', new THREE.Float32BufferAttribute(aShoreTs, 1));
  geometry.setAttribute('aSkirtDrop', new THREE.Float32BufferAttribute(aSkirtDrops, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

function createPolygonWaterGeometry(
  rings: GeoJSON.Position[][],
  worldCenterLatlng: LatLng,
  demAtlas?: DemAtlas,
  elevationOffset = DEFAULT_WATER_ELEVATION_OFFSET,
): THREE.BufferGeometry | null {
  if (rings.length === 0 || rings[0].length < 3) return null;

  const outerRing = subdivideCoordinates(rings[0]);
  const holeRings = rings.slice(1).map((r) => subdivideCoordinates(r));

  const outerPoints2D: THREE.Vector2[] = [];
  const all3DPoints: THREE.Vector3[] = [];

  for (const [lng, lat] of outerRing) {
    const offset = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);
    outerPoints2D.push(new THREE.Vector2(offset.x, offset.z));
    all3DPoints.push(new THREE.Vector3(offset.x, 0, offset.z));
  }

  const holes2D: THREE.Vector2[][] = [];
  for (const hole of holeRings) {
    if (hole.length < 3) continue;
    const holePoints: THREE.Vector2[] = [];
    for (const [lng, lat] of hole) {
      const offset = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);
      holePoints.push(new THREE.Vector2(offset.x, offset.z));
      all3DPoints.push(new THREE.Vector3(offset.x, 0, offset.z));
    }
    holes2D.push(holePoints);
  }

  try {
    const faces = THREE.ShapeUtils.triangulateShape(outerPoints2D, holes2D);
    if (!faces || faces.length === 0) return null;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const demUvs: number[] = [];
    const aShoreTs: number[] = [];
    const aSkirtDrops: number[] = [];
    const indices: number[] = [];

    // Top cap
    for (const pt of all3DPoints) {
      positions.push(pt.x, pt.y, pt.z);
      normals.push(0, 1, 0);
      uvs.push(pt.x * 0.01, pt.z * 0.01);
      aShoreTs.push(0.0);
      aSkirtDrops.push(0.0);

      if (demAtlas) {
        const uv = demAtlas.getDemUvFromOffset(pt.x, pt.z, worldCenterLatlng);
        demUvs.push(uv.u, uv.v);
      } else {
        demUvs.push(0, 0);
      }
    }

    for (const face of faces) {
      indices.push(face[0], face[1], face[2]);
    }

    // Boundary skirts for all polygon rings
    const allRings = [outerRing, ...holeRings];
    for (const ring of allRings) {
      const ringLen = ring.length;
      if (ringLen < 3) continue;

      const isClosed = ring[0][0] === ring[ringLen - 1][0] && ring[0][1] === ring[ringLen - 1][1];
      const count = isClosed ? ringLen - 1 : ringLen;
      if (count < 3) continue;

      const ringStartIndex = positions.length / 3;

      for (let i = 0; i < count; i += 1) {
        const [lng, lat] = ring[i];
        const offset = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);

        const demUv = demAtlas
          ? demAtlas.getDemUvFromOffset(offset.x, offset.z, worldCenterLatlng)
          : { u: 0, v: 0 };

        // Top vertex (at elevationOffset)
        positions.push(offset.x, 0, offset.z);
        normals.push(0, 1, 0);
        uvs.push(offset.x * 0.01, offset.z * 0.01);
        demUvs.push(demUv.u, demUv.v);
        aShoreTs.push(1.0);
        aSkirtDrops.push(0.0);

        // Bottom vertex (dropped to terrain)
        positions.push(offset.x, 0, offset.z);
        normals.push(0, 1, 0);
        uvs.push(offset.x * 0.01, offset.z * 0.01);
        demUvs.push(demUv.u, demUv.v);
        aShoreTs.push(1.0);
        aSkirtDrops.push(elevationOffset);
      }

      for (let i = 0; i < count; i += 1) {
        const next = (i + 1) % count;
        const topCurr = ringStartIndex + i * 2;
        const botCurr = topCurr + 1;
        const topNext = ringStartIndex + next * 2;
        const botNext = topNext + 1;

        indices.push(topCurr, botCurr, topNext);
        indices.push(botCurr, botNext, topNext);
        indices.push(topCurr, topNext, botCurr);
        indices.push(botCurr, topNext, botNext);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('demUv', new THREE.Float32BufferAttribute(demUvs, 2));
    geometry.setAttribute('aShoreT', new THREE.Float32BufferAttribute(aShoreTs, 1));
    geometry.setAttribute('aSkirtDrop', new THREE.Float32BufferAttribute(aSkirtDrops, 1));
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
  demAtlas?: DemAtlas,
  elevationOffset = DEFAULT_WATER_ELEVATION_OFFSET,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'osm-waters';

  const geometries: THREE.BufferGeometry[] = [];

  for (const feature of collection.features) {
    if (!feature.geometry) continue;

    const type = feature.geometry.type;

    if (type === 'LineString' || type === 'MultiLineString') {
      const rawLines = extractLineCoordinates(feature.geometry);
      const waterwayType = getWaterwayType(feature);
      const width = getWaterwayWidth(waterwayType);

      for (const rawLine of rawLines) {
        if (rawLine.length < 2) continue;

        const line = subdivideCoordinates(rawLine);

        const points = line.map(([lng, lat]) => {
          const offset = latLngToMetersOffset(
            lat,
            lng,
            worldCenterLatlng.lat,
            worldCenterLatlng.lng,
          );
          return new THREE.Vector3(offset.x, 0, offset.z);
        });

        const ribbonGeom = createWaterRibbonGeometry(
          points,
          width,
          demAtlas,
          worldCenterLatlng,
          elevationOffset,
        );
        if (ribbonGeom) {
          geometries.push(ribbonGeom);
        }
      }
    } else if (type === 'Polygon' || type === 'MultiPolygon') {
      const polygonList = extractPolygonCoordinates(feature.geometry);
      for (const rings of polygonList) {
        const polyGeom = createPolygonWaterGeometry(
          rings,
          worldCenterLatlng,
          demAtlas,
          elevationOffset,
        );
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
      const normalTexture = getWaterNormalTexture();

      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...SolarUniforms,
          demAtlas: demAtlas ? demAtlas.textureUniform : { value: new THREE.Texture() },
          demMedian: demAtlas ? demAtlas.demMedianUniform : { value: 0 },
          elevationOffset: { value: elevationOffset },
          diffuseColor: { value: new THREE.Color(DEFAULT_WATER_COLOR) },
          opacity: { value: 0.85 },
          normalSampler: { value: normalTexture },
          uTime: { value: 0 },
        },
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: true,
      });

      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'waters-mesh';
      group.add(mesh);
    }
  }

  return group;
}

export function updateWatersAnimation(group: THREE.Group | null, deltaSeconds: number): void {
  if (!group) return;

  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
      if (child.material.uniforms.uTime) {
        child.material.uniforms.uTime.value += deltaSeconds;
      }
    }
  });
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
