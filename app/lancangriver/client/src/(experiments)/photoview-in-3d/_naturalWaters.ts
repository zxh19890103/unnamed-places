import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latLngToMetersOffset, LatLng } from './_fns';
import { DemAtlas } from './_demAtlas';
import { SolarUniforms } from './_solar.js';
import { getWaterNormalTexture, waterVertexShader, waterFragmentShader } from './_waters.js';

export const DEFAULT_NATURAL_WATER_COLOR = '#0a4f5c';

export function extractPolygonCoordinates(geometry: GeoJSON.Geometry): GeoJSON.Position[][][] {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates;
  }
  return [];
}

export function createPolygonWaterGeometry(
  rings: GeoJSON.Position[][],
  worldCenterLatlng: LatLng,
  demAtlas?: DemAtlas,
): THREE.BufferGeometry | null {
  if (rings.length === 0 || rings[0].length < 3) return null;

  const outerRing = rings[0];
  const holeRings = rings.slice(1);

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
    const indices: number[] = [];

    for (const pt of all3DPoints) {
      positions.push(pt.x, pt.y, pt.z);
      normals.push(0, 1, 0);
      uvs.push(pt.x * 0.01, pt.z * 0.01);
      aShoreTs.push(0.0);

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

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('demUv', new THREE.Float32BufferAttribute(demUvs, 2));
    geometry.setAttribute('aShoreT', new THREE.Float32BufferAttribute(aShoreTs, 1));
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
 */
export function buildNaturalWatersGroup(
  collection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas?: DemAtlas,
  elevationOffset = 0.25,
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
        const polyGeom = createPolygonWaterGeometry(rings, worldCenterLatlng, demAtlas);
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
          diffuseColor: { value: new THREE.Color(DEFAULT_NATURAL_WATER_COLOR) },
          opacity: { value: 0.88 },
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
      mesh.name = 'natural-waters-mesh';
      // mesh.renderOrder = 999999;
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
