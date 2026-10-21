import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latLngToMetersOffset, LatLng } from './_fns';
import { DemAtlas } from './_demAtlas';
import { SolarUniforms } from './_solar.js';
import { getWaterNormalTexture } from './_waters.js';
import { SatelliteAtlas } from './_satelliteAtlas';
import { __glsl_chunks_common__ } from './_glsl';

const DEFAULT_NATURAL_WATER_COLOR = '#1a8ea3';
const DEFAULT_NATURAL_WATER_ELEVATION_OFFSET = 10.0;
const MAX_RING_SEGMENT_LENGTH_METERS = 30;

const naturalWaterVertexShader = /* glsl */ `
  #include <logdepthbuf_pars_vertex>

  uniform sampler2D demAtlas;
  uniform float demMedian;
  uniform float elevationOffset;

  attribute vec2 demUv;
  attribute float aShoreT;
  attribute float aSkirtDrop;

  varying vec2 vUv;
  varying vec2 vDemUv;
  varying vec3 vWorldPosition;
  varying float vShoreT;
  varying float vSkirtDrop;

  ${__glsl_chunks_common__} 

  void main() {
    vUv = uv;
    vShoreT = aShoreT;
    vSkirtDrop = aSkirtDrop;

    vec2 clampedUv = clamp(demUv, 0.0, 1.0);
    vDemUv = demUv;
    float elevation = texture2D(demAtlas, clampedUv).r;
    float raise = elevation - demMedian;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    // Raise the surface by elevationOffset, and drop skirt vertices back down to terrain
    worldPosition.y += raise + elevationOffset - aSkirtDrop;

    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;

    #include <logdepthbuf_vertex>
  }
`;

const naturalWaterFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>

  uniform vec3 diffuseColor;
  uniform float opacity;

  uniform sampler2D satelliteAtlas;
  uniform sampler2D normalSampler;

  uniform float uTime;
  uniform vec3 sunDirection;

  varying vec2 vUv;
  varying vec2 vDemUv;
  varying vec3 vWorldPosition;
  varying float vShoreT;
  varying float vSkirtDrop;

  void main() {
    #include <logdepthbuf_fragment>

    // World space horizontal coordinates for ripple scale
    vec2 flowUv = vWorldPosition.xz * 0.001;

    // Dual-layer scrolling normals for calm water waves
    vec2 flowOffset1 = vec2(uTime * 0.012, uTime * 0.008);
    vec2 flowOffset2 = vec2(-uTime * 0.009, uTime * 0.003);

    vec3 normalSample1 = texture2D(normalSampler, flowUv + flowOffset1).rgb * 2.0 - 1.0;
    vec3 normalSample2 = texture2D(normalSampler, flowUv * 1.3 + flowOffset2).rgb * 2.0 - 1.0;
    vec3 rawNormal = normalize(normalSample1 + normalSample2);

    float waveStrength = 1.4;
    vec3 worldNormal = normalize(vec3(rawNormal.x * waveStrength, 1.0, rawNormal.y * waveStrength));

    // Direction vectors
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 lightDir = normalize(sunDirection);

    vec3 diffuseColor2 = texture2D(satelliteAtlas, vDemUv).rgb;

    float NdotL = max(0.0, dot(worldNormal, lightDir));
    vec3 baseColor = diffuseColor * diffuseColor2 * (0.85 + 0.3 * NdotL);

    // Darken skirt wall toward deeper shoreline tone as it drops down
    if (vSkirtDrop > 0.01) {
      float dropFactor = clamp(vSkirtDrop / 10.0, 0.0, 1.0);
      vec3 deepSkirtColor = diffuseColor2 * 0.55;
      baseColor = mix(baseColor, deepSkirtColor, dropFactor);
    }

    // Blinn-Phong specular highlight on top surface
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotH = max(0.0, dot(worldNormal, halfVec));
    float specular = pow(NdotH, 48.0) * 0.5;

    // Subtle Fresnel sheen
    float fresnel = pow(1.0 - max(0.0, dot(worldNormal, viewDir)), 2.0);

    vec3 finalColor = baseColor + vec3(1.0, 0.98, 0.92) * specular + vec3(0.08, 0.16, 0.20) * (fresnel * 0.3);

    gl_FragColor = vec4(finalColor, opacity);
  }
`;

function extractPolygonCoordinates(geometry: GeoJSON.Geometry): GeoJSON.Position[][][] {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates;
  }
  return [];
}

/**
 * Subdivide a ring to ensure vertex spacing does not exceed maxDistanceMeters,
 * allowing the skirt bottom to follow terrain contours smoothly.
 */
function subdivideRing(
  ring: GeoJSON.Position[],
  maxDistance = MAX_RING_SEGMENT_LENGTH_METERS,
): GeoJSON.Position[] {
  if (ring.length < 2) return ring;

  const result: GeoJSON.Position[] = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const p1 = ring[i];
    const p2 = ring[i + 1];
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

  result.push(ring[ring.length - 1]);
  return result;
}

/**
 * Creates 3D water geometry with a flat top cap (at +elevationOffset)
 * and an extruded vertical skirt dropped down to the original terrain elevation.
 */
function createPolygonWaterGeometry(
  rings: GeoJSON.Position[][],
  worldCenterLatlng: LatLng,
  demAtlas?: DemAtlas,
  elevationOffset = DEFAULT_NATURAL_WATER_ELEVATION_OFFSET,
): THREE.BufferGeometry | null {
  if (rings.length === 0 || rings[0].length < 3) return null;

  // 1. Subdivide rings for contour conformity
  const outerRing = subdivideRing(rings[0]);
  const holeRings = rings.slice(1).map((r) => subdivideRing(r));

  // 2. Prepare 2D coordinates for polygon triangulation (top cap)
  const outerPoints2D: THREE.Vector2[] = [];
  const topPoints3D: THREE.Vector3[] = [];

  for (const [lng, lat] of outerRing) {
    const offset = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);
    outerPoints2D.push(new THREE.Vector2(offset.x, offset.z));
    topPoints3D.push(new THREE.Vector3(offset.x, 0, offset.z));
  }

  const holes2D: THREE.Vector2[][] = [];
  for (const hole of holeRings) {
    if (hole.length < 3) continue;
    const holePoints: THREE.Vector2[] = [];
    for (const [lng, lat] of hole) {
      const offset = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);
      holePoints.push(new THREE.Vector2(offset.x, offset.z));
      topPoints3D.push(new THREE.Vector3(offset.x, 0, offset.z));
    }
    holes2D.push(holePoints);
  }

  try {
    const topFaces = THREE.ShapeUtils.triangulateShape(outerPoints2D, holes2D);
    if (!topFaces || topFaces.length === 0) return null;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const demUvs: number[] = [];
    const aShoreTs: number[] = [];
    const aSkirtDrops: number[] = [];
    const indices: number[] = [];

    // --- Build Top Cap ---
    for (const pt of topPoints3D) {
      positions.push(pt.x, pt.y, pt.z);
      normals.push(0, 1, 0);
      uvs.push(pt.x * 0.01, pt.z * 0.01);
      aShoreTs.push(0.0);
      aSkirtDrops.push(0.0); // Top surface stays at +elevationOffset

      if (demAtlas) {
        const uv = demAtlas.getDemUvFromOffset(pt.x, pt.z, worldCenterLatlng);
        demUvs.push(uv.u, uv.v);
      } else {
        demUvs.push(0, 0);
      }
    }

    for (const face of topFaces) {
      indices.push(face[0], face[1], face[2]);
    }

    // --- Build Sloped Shoreline Skirt for all rings (outer + holes) ---
    const allRings = [outerRing, ...holeRings];
    const flareDistance = 3.5;

    for (const ring of allRings) {
      const ringLen = ring.length;
      if (ringLen < 3) continue;

      // Close ring if last point != first point
      const isClosed = ring[0][0] === ring[ringLen - 1][0] && ring[0][1] === ring[ringLen - 1][1];
      const count = isClosed ? ringLen - 1 : ringLen;
      if (count < 3) continue;

      // Calculate signed area to determine outer (CW/CCW) orientation
      let signedArea = 0;
      for (let i = 0; i < count; i += 1) {
        const p1 = ring[i];
        const p2 = ring[(i + 1) % count];
        signedArea += (p2[0] - p1[0]) * (p2[1] + p1[1]);
      }
      // In meter offset coords, sign determines left/right normal
      const isClockwise = signedArea > 0;

      // Compute 2D meter offsets for ring vertices
      const ringOffsets = [];
      for (let i = 0; i < count; i += 1) {
        const [lng, lat] = ring[i];
        ringOffsets.push(
          latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng),
        );
      }

      // Calculate outward normal at each vertex by averaging adjacent edge normals
      const outwardNormals: { nx: number; nz: number }[] = [];
      for (let i = 0; i < count; i += 1) {
        const prev = ringOffsets[(i - 1 + count) % count];
        const curr = ringOffsets[i];
        const next = ringOffsets[(i + 1) % count];

        const dx1 = curr.x - prev.x;
        const dz1 = curr.z - prev.z;
        const dx2 = next.x - curr.x;
        const dz2 = next.z - curr.z;

        // Perpendiculars (outward depends on winding)
        const sign = isClockwise ? 1 : -1;
        const n1x = dz1 * sign;
        const n1z = -dx1 * sign;
        const n2x = dz2 * sign;
        const n2z = -dx2 * sign;

        const avgNx = n1x + n2x;
        const avgNz = n1z + n2z;
        const len = Math.hypot(avgNx, avgNz);

        if (len > 1e-4) {
          outwardNormals.push({ nx: avgNx / len, nz: avgNz / len });
        } else {
          outwardNormals.push({ nx: 0, nz: 0 });
        }
      }

      const ringStartIndex = positions.length / 3;

      for (let i = 0; i < count; i += 1) {
        const offset = ringOffsets[i];
        const norm = outwardNormals[i];

        const demUv = demAtlas
          ? demAtlas.getDemUvFromOffset(offset.x, offset.z, worldCenterLatlng)
          : { u: 0, v: 0 };

        // Top vertex (stays at elevated surface)
        positions.push(offset.x, 0, offset.z);
        normals.push(0, 1, 0);
        uvs.push(offset.x * 0.01, offset.z * 0.01);
        demUvs.push(demUv.u, demUv.v);
        aShoreTs.push(1.0);
        aSkirtDrops.push(0.0);

        // Bottom vertex: pushed outward by flareDistance along normal, dropped to terrain
        const botX = offset.x + norm.nx * flareDistance;
        const botZ = offset.z + norm.nz * flareDistance;
        const botUv = demAtlas ? demAtlas.getDemUvFromOffset(botX, botZ, worldCenterLatlng) : demUv;

        positions.push(botX, 0, botZ);
        normals.push(0, 1, 0);
        uvs.push(botX * 0.01, botZ * 0.01);
        demUvs.push(botUv.u, botUv.v);
        aShoreTs.push(1.0);
        aSkirtDrops.push(elevationOffset);
      }

      // Generate quad faces connecting top & bottom vertices along the ring
      for (let i = 0; i < count; i += 1) {
        const next = (i + 1) % count;
        const topCurrent = ringStartIndex + i * 2;
        const botCurrent = topCurrent + 1;
        const topNext = ringStartIndex + next * 2;
        const botNext = topNext + 1;

        // Double-sided quad faces
        indices.push(topCurrent, botCurrent, topNext);
        indices.push(botCurrent, botNext, topNext);
        indices.push(topCurrent, topNext, botCurrent);
        indices.push(botCurrent, topNext, botNext);
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

/**
 * Builds 3D natural water surface meshes (lakes, reservoirs, ponds, basins).
 * Strictly considers Polygon and MultiPolygon geometries only.
 * Surface raised by elevationOffset (default 10m) with vertical skirts to prevent z-fighting.
 */
export function buildNaturalWatersGroup(
  collection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas: DemAtlas,
  satelliteAtlas: SatelliteAtlas,
  elevationOffset = DEFAULT_NATURAL_WATER_ELEVATION_OFFSET,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'osm-natural-waters';

  const geometries: THREE.BufferGeometry[] = [];

  for (const feature of collection.features) {
    if (!feature.geometry) continue;

    const type = feature.geometry.type;
    // Strictly consider only Polygon and MultiPolygon
    if (type === 'Polygon' || type === 'MultiPolygon') {
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
          satelliteAtlas: satelliteAtlas.textureUniform,
          elevationOffset: { value: elevationOffset },
          diffuseColor: { value: new THREE.Color(DEFAULT_NATURAL_WATER_COLOR) },
          opacity: { value: 0.88 },
          normalSampler: { value: normalTexture },
          uTime: { value: 0 },
        },
        vertexShader: naturalWaterVertexShader,
        fragmentShader: naturalWaterFragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: true,
      });

      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'natural-waters-mesh';
      group.add(mesh);
    }
  }

  return group;
}

export function updateNaturalWatersAnimation(
  group: THREE.Group | null,
  deltaSeconds: number,
): void {
  if (!group) return;

  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
      if (child.material.uniforms.uTime) {
        child.material.uniforms.uTime.value += deltaSeconds;
      }
    }
  });
}

export function disposeNaturalWatersGroup(group: THREE.Group | null): void {
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
