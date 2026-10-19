import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latLngToMetersOffset, LatLng } from './_fns';
import { DemAtlas } from './_demAtlas';
import { SolarUniforms } from './_solar.js';
import { SatelliteAtlas } from './_satelliteAtlas';
import { __glsl_chunks_common__ } from './_glsl';

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

const DEFAULT_WATER_COLOR = '#1a8ea3';
const MAX_SEGMENT_LENGTH_METERS = 30;
const WATER_WIDTH_SCALE = 1;
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
  #include <logdepthbuf_pars_vertex>

  uniform sampler2D demAtlas;
  uniform float demMedian;
  uniform float elevationOffset;

  attribute vec2 demUv;
  attribute float aShoreT;

  varying vec2 vUv;
  varying vec2 vDemUv;
  varying vec3 vWorldPosition;
  varying float vShoreT;

  ${__glsl_chunks_common__}

  void main() {
    vUv = uv;
    vShoreT = aShoreT;

    vec2 clampedUv = clamp(demUv, 0.0, 1.0);
    vDemUv = clampedUv;

    float elevation = texture2D(demAtlas, clampedUv).r;
    float raise = elevation - demMedian;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    worldPosition.y += raise + elevationOffset;

    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;

    #include <logdepthbuf_vertex>
  }
`;

const waterFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>

  uniform vec3 diffuseColor;
  uniform vec3 shoreColor;
  uniform float opacity;

  uniform sampler2D normalSampler;
  
  uniform float uTime;
  uniform vec3 sunDirection;

  varying vec2 vDemUv;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying float vShoreT;

  void main() {
    #include <logdepthbuf_fragment>

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
    baseColor = mix(baseColor, shoreColor, shoreFactor);

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
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const demUvs: number[] = [];
  const aShoreTs: number[] = [];
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

    const halfWidth = (WATER_WIDTH_SCALE * width) / 2;
    left.copy(point).addScaledVector(side, halfWidth);
    right.copy(point).addScaledVector(side, -halfWidth);

    const v = cumulativeDistances[i] / totalLength;
    positions.push(left.x, left.y, left.z, point.x, point.y, point.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(0, v, 0.5, v, 1, v);
    aShoreTs.push(1.0, 0.0, 1.0);

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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('demUv', new THREE.Float32BufferAttribute(demUvs, 2));
  geometry.setAttribute('aShoreT', new THREE.Float32BufferAttribute(aShoreTs, 1));
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

export function buildWatersGroup(
  collection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas: DemAtlas,
  satelliteAtlas: SatelliteAtlas,
  elevationOffset = DEFAULT_WATER_ELEVATION_OFFSET,
  collectionNatural: GeoJSON.FeatureCollection,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'osm-waters';

  const geometries: THREE.BufferGeometry[] = [];

  const readPropertyName = (properties: GeoJSON.GeoJsonProperties, name = 'name') => {
    if (!properties) return '';
    const tags = properties.tags;
    if (!tags) return '';
    return tags[name] ?? '';
  };

  const naturalWaterNames = new Set(
    collectionNatural?.features
      .flatMap((p) => [
        readPropertyName(p.properties, 'name'),
        readPropertyName(p.properties, 'name:en'),
        readPropertyName(p.properties, 'name:zh'),
      ])
      .filter(Boolean) ?? [],
  );

  const hasNatural = (properties: GeoJSON.GeoJsonProperties) => {
    const name = readPropertyName(properties);
    if (!name) return false;
    return naturalWaterNames.has(properties.name);
  };

  for (const feature of collection.features) {
    if (!feature.geometry) continue;

    const type = feature.geometry.type;

    if (type === 'LineString' || type === 'MultiLineString') {
      const rawLines = extractLineCoordinates(feature.geometry);
      const waterwayType = getWaterwayType(feature);
      const width = getWaterwayWidth(waterwayType);
      if (hasNatural(feature.properties)) continue;

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

        const ribbonGeom = createWaterRibbonGeometry(points, width, demAtlas, worldCenterLatlng);
        if (ribbonGeom) {
          geometries.push(ribbonGeom);
        }
      }
    } else if (type === 'Polygon' || type === 'MultiPolygon') {
      //
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
          satelliteAtlas: satelliteAtlas.textureUniform,
          elevationOffset: { value: elevationOffset },
          diffuseColor: { value: new THREE.Color(DEFAULT_WATER_COLOR) },
          shoreColor: { value: new THREE.Color(DEFAULT_WATER_COLOR) },
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
