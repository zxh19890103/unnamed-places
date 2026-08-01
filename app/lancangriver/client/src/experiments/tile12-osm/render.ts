import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { TileCoords } from "../../osm/tiles";
import {
  classifyPolygonFeature,
  createTileProjection,
  readFeatureNumber,
  type TileProjection,
} from "./tile";

type TileVectorGroup = {
  group: THREE.Group;
  projection: TileProjection;
  objectCount: number;
  dispose: () => void;
};

const DEFAULT_BUILDING_HEIGHT = 12;
const METERS_PER_LEVEL = 3.2;
const RANDOM_HEIGHT_MIN = 6;
const RANDOM_HEIGHT_MAX = 45;
const BUILDING_TEXTURE_REPEAT_METERS = 6;
const BUILDING_TEXTURE_PATH = "/textures/building-wall.jpg";

const BUILDING_TYPE_LEVEL_HINTS: Record<string, number> = {
  house: 2,
  detached: 2,
  bungalow: 1,
  hut: 1,
  cabin: 1,
  residential: 3,
  terrace: 3,
  apartments: 6,
  dormitory: 5,
  office: 7,
  commercial: 5,
  retail: 3,
  industrial: 4,
  warehouse: 3,
  school: 4,
  university: 5,
  hospital: 6,
  hotel: 8,
  church: 3,
  cathedral: 5,
  mosque: 4,
  synagogue: 3,
  government: 5,
};

let cachedBuildingTexture: THREE.Texture | null | undefined;

function getBuildingTexture(): THREE.Texture | null {
  if (cachedBuildingTexture !== undefined) {
    return cachedBuildingTexture;
  }

  // Vitest/node does not provide browser image loading for TextureLoader.
  if (typeof window === "undefined") {
    cachedBuildingTexture = null;
    return cachedBuildingTexture;
  }

  const texture = new THREE.TextureLoader().load(BUILDING_TEXTURE_PATH);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  cachedBuildingTexture = texture;
  return cachedBuildingTexture;
}

function applyBuildingRepeatUv(
  geometry: THREE.BufferGeometry,
  repeatMeters = BUILDING_TEXTURE_REPEAT_METERS,
): void {
  const position = geometry.getAttribute("position");
  if (!position) {
    return;
  }

  const normal = geometry.getAttribute("normal");
  const uv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = normal ? normal.getX(index) : 0;
    const ny = normal ? normal.getY(index) : 0;
    const nz = normal ? normal.getZ(index) : 0;

    let u: number;
    let v: number;

    if (Math.abs(ny) > 0.7) {
      u = x / repeatMeters;
      v = z / repeatMeters;
    } else {
      // Map wall U using the dominant horizontal normal axis.
      // This avoids radial world-origin mapping, which causes visible stretching.
      u = Math.abs(nx) >= Math.abs(nz) ? z / repeatMeters : x / repeatMeters;
      v = y / repeatMeters;
    }

    uv[index * 2] = u;
    uv[index * 2 + 1] = v;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

type GeometryKind =
  | "buildingRoof"
  | "buildingWall"
  | "water"
  | "other"
  | "line"
  | "point";

type GeometryBuckets = Record<GeometryKind, THREE.BufferGeometry[]>;

function splitBuildingGeometryByFaceType(geometry: THREE.BufferGeometry): {
  roof: THREE.BufferGeometry | null;
  wall: THREE.BufferGeometry | null;
} {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");

  if (!position || !normal) {
    source.dispose();
    return { roof: null, wall: null };
  }

  const roofPositions: number[] = [];
  const roofNormals: number[] = [];
  const roofUvs: number[] = [];
  const wallPositions: number[] = [];
  const wallNormals: number[] = [];
  const wallUvs: number[] = [];

  for (let base = 0; base < position.count; base += 3) {
    const ny0 = normal.getY(base);
    const ny1 = normal.getY(base + 1);
    const ny2 = normal.getY(base + 2);
    const isRoofTriangle =
      (Math.abs(ny0) + Math.abs(ny1) + Math.abs(ny2)) / 3 > 0.7;

    const outPositions = isRoofTriangle ? roofPositions : wallPositions;
    const outNormals = isRoofTriangle ? roofNormals : wallNormals;
    const outUvs = isRoofTriangle ? roofUvs : wallUvs;

    for (let offset = 0; offset < 3; offset += 1) {
      const index = base + offset;
      outPositions.push(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      );
      outNormals.push(
        normal.getX(index),
        normal.getY(index),
        normal.getZ(index),
      );
      if (uv) {
        outUvs.push(uv.getX(index), uv.getY(index));
      }
    }
  }

  source.dispose();

  const createGeometry = (
    positions: number[],
    normals: number[],
    uvs: number[],
  ): THREE.BufferGeometry | null => {
    if (positions.length === 0) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    if (uvs.length > 0) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    }
    return geometry;
  };

  return {
    roof: createGeometry(roofPositions, roofNormals, roofUvs),
    wall: createGeometry(wallPositions, wallNormals, wallUvs),
  };
}

function ringPoints(
  ring: GeoJSON.Position[],
  projection: TileProjection,
): THREE.Vector2[] {
  const end = ring.length > 1 ? ring.length - 1 : ring.length;
  return ring.slice(0, end).map((position) => {
    const { x, z } = projection.project(position);
    return new THREE.Vector2(x, -z);
  });
}

function polygonShape(
  rings: GeoJSON.Position[][],
  projection: TileProjection,
): THREE.Shape | null {
  if (rings.length === 0) {
    return null;
  }

  const outer = ringPoints(rings[0], projection);
  if (outer.length < 3) {
    return null;
  }

  const shape = new THREE.Shape(outer);
  for (const ring of rings.slice(1)) {
    const hole = ringPoints(ring, projection);
    if (hole.length >= 3) {
      shape.holes.push(new THREE.Path(hole));
    }
  }

  return shape;
}

function buildingHeight(feature: GeoJSON.Feature): number {
  const height = readFeatureNumber(feature, "height");
  if (height !== null && height > 0) {
    return height;
  }

  const minHeight = Math.max(readFeatureNumber(feature, "min_height") ?? 0, 0);
  const levels = readFeatureNumber(feature, "building:levels");
  if (levels !== null && levels > 0) {
    return minHeight + levels * METERS_PER_LEVEL;
  }

  const roofLevels = Math.max(
    readFeatureNumber(feature, "roof:levels") ?? 0,
    0,
  );

  const buildingType =
    readFeatureString(feature, "building") ??
    readFeatureString(feature, "building:use") ??
    readFeatureString(feature, "amenity") ??
    "";
  const normalizedType = buildingType.toLowerCase();
  const inferredLevels =
    BUILDING_TYPE_LEVEL_HINTS[normalizedType] ??
    BUILDING_TYPE_LEVEL_HINTS[
      normalizedType.split(";")[0]?.trim() ?? normalizedType
    ];

  if (inferredLevels !== undefined) {
    return minHeight + (inferredLevels + roofLevels) * METERS_PER_LEVEL;
  }

  const fallback = randomHeightForFeature(
    feature,
    RANDOM_HEIGHT_MIN,
    RANDOM_HEIGHT_MAX,
  );
  return minHeight + fallback + roofLevels * METERS_PER_LEVEL;
}

function randomHeightForFeature(
  feature: GeoJSON.Feature,
  min: number,
  max: number,
): number {
  const idCandidate =
    readFeatureString(feature, "id") ??
    readFeatureString(feature, "@id") ??
    feature.id?.toString();

  if (!idCandidate) {
    return min + Math.random() * (max - min);
  }

  const random01 = pseudoRandomFromString(idCandidate);
  return min + random01 * (max - min);
}

function pseudoRandomFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function readFeatureString(
  feature: GeoJSON.Feature,
  key: string,
): string | null {
  const properties = feature.properties;
  if (!properties || typeof properties !== "object") {
    return null;
  }

  const direct = (properties as Record<string, unknown>)[key];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }

  const tags = (properties as Record<string, unknown>).tags;
  if (tags && typeof tags === "object") {
    const fromTags = (tags as Record<string, unknown>)[key];
    if (typeof fromTags === "string" && fromTags.trim().length > 0) {
      return fromTags;
    }
  }

  return null;
}

function addPolygon(
  feature: GeoJSON.Feature,
  rings: GeoJSON.Position[][],
  projection: TileProjection,
): {
  kind: "building" | "water" | "other";
  geometry: THREE.BufferGeometry;
} | null {
  const shape = polygonShape(rings, projection);
  if (!shape) {
    return null;
  }

  const kind = classifyPolygonFeature(feature);
  let geometry: THREE.BufferGeometry;

  if (kind === "building") {
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1, buildingHeight(feature)),
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1,
    });
  } else {
    geometry = new THREE.ShapeGeometry(shape);
  }

  geometry.rotateX(-Math.PI / 2);
  if (kind !== "building") {
    geometry.translate(0, kind === "water" ? 0.1 : 0.05, 0);
  } else {
    applyBuildingRepeatUv(geometry);
  }

  return { kind, geometry };
}

function addLine(
  coordinates: GeoJSON.Position[],
  projection: TileProjection,
): THREE.BufferGeometry | null {
  if (coordinates.length < 2) {
    return null;
  }

  const segments: THREE.Vector3[] = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = projection.project(coordinates[index - 1]);
    const end = projection.project(coordinates[index]);
    segments.push(
      new THREE.Vector3(start.x, 0.35, start.z),
      new THREE.Vector3(end.x, 0.35, end.z),
    );
  }

  return new THREE.BufferGeometry().setFromPoints(segments);
}

function addPoint(
  position: GeoJSON.Position,
  projection: TileProjection,
  markerTemplate: THREE.SphereGeometry,
): THREE.BufferGeometry {
  const projected = projection.project(position);
  const geometry = markerTemplate.clone();
  geometry.translate(
    projected.x,
    markerTemplate.parameters.radius,
    projected.z,
  );
  return geometry;
}

function addMergedMesh(
  group: THREE.Group,
  geometries: THREE.BufferGeometry[],
  material: THREE.MeshStandardMaterial,
): void {
  if (geometries.length === 0) {
    return;
  }

  if (geometries.length === 1) {
    group.add(new THREE.Mesh(geometries[0], material));
    return;
  }

  const merged = mergeGeometries(geometries, false);
  if (!merged) {
    for (const geometry of geometries) {
      group.add(new THREE.Mesh(geometry, material));
    }
    return;
  }

  for (const geometry of geometries) {
    geometry.dispose();
  }
  group.add(new THREE.Mesh(merged, material));
}

function addMergedLineSegments(
  group: THREE.Group,
  geometries: THREE.BufferGeometry[],
  material: THREE.LineBasicMaterial,
): void {
  if (geometries.length === 0) {
    return;
  }

  if (geometries.length === 1) {
    group.add(new THREE.LineSegments(geometries[0], material));
    return;
  }

  const merged = mergeGeometries(geometries, false);
  if (!merged) {
    for (const geometry of geometries) {
      group.add(new THREE.LineSegments(geometry, material));
    }
    return;
  }

  for (const geometry of geometries) {
    geometry.dispose();
  }
  group.add(new THREE.LineSegments(merged, material));
}

function addFeature(
  feature: GeoJSON.Feature,
  projection: TileProjection,
  buckets: GeometryBuckets,
  markerTemplate: THREE.SphereGeometry,
): number {
  const geometry = feature.geometry;
  if (!geometry) {
    return 0;
  }

  switch (geometry.type) {
    case "Polygon": {
      const polygon = addPolygon(feature, geometry.coordinates, projection);
      if (!polygon) {
        return 0;
      }
      if (polygon.kind === "building") {
        const split = splitBuildingGeometryByFaceType(polygon.geometry);
        polygon.geometry.dispose();
        if (split.roof) {
          buckets.buildingRoof.push(split.roof);
        }
        if (split.wall) {
          buckets.buildingWall.push(split.wall);
        }
      } else {
        buckets[polygon.kind].push(polygon.geometry);
      }
      return 1;
    }
    case "MultiPolygon":
      return geometry.coordinates.reduce((count, polygon) => {
        const shape = addPolygon(feature, polygon, projection);
        if (!shape) {
          return count;
        }
        if (shape.kind === "building") {
          const split = splitBuildingGeometryByFaceType(shape.geometry);
          shape.geometry.dispose();
          if (split.roof) {
            buckets.buildingRoof.push(split.roof);
          }
          if (split.wall) {
            buckets.buildingWall.push(split.wall);
          }
        } else {
          buckets[shape.kind].push(shape.geometry);
        }
        return count + 1;
      }, 0);
    case "LineString": {
      const line = addLine(geometry.coordinates, projection);
      if (!line) {
        return 0;
      }
      buckets.line.push(line);
      return 1;
    }
    case "MultiLineString":
      return geometry.coordinates.reduce((count, line) => {
        const geometry = addLine(line, projection);
        if (!geometry) {
          return count;
        }
        buckets.line.push(geometry);
        return count + 1;
      }, 0);
    case "Point":
      buckets.point.push(
        addPoint(geometry.coordinates, projection, markerTemplate),
      );
      return 1;
    case "MultiPoint":
      return geometry.coordinates.reduce(
        (count, point) =>
          count +
          (buckets.point.push(addPoint(point, projection, markerTemplate)), 1),
        0,
      );
    default:
      return 0;
  }
}

export function buildTileVectorGroup(
  features: GeoJSON.Feature[],
  tile: TileCoords,
): TileVectorGroup {
  const projection = createTileProjection(tile);
  const group = new THREE.Group();
  group.name = `tile-vectors-${tile.z}-${tile.x}-${tile.y}`;

  const markerRadius = Math.max(
    1,
    Math.min(projection.widthMeters, projection.heightMeters) * 0.004,
  );
  const buildingTexture = getBuildingTexture();
  const materials = {
    buildingRoof: new THREE.MeshStandardMaterial({
      color: "#e7c9a8",
      roughness: 0.92,
      metalness: 0.01,
      side: THREE.DoubleSide,
    }),
    buildingWall: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      ...(buildingTexture ? { map: buildingTexture } : {}),
      roughness: 0.88,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    water: new THREE.MeshStandardMaterial({
      color: "#3b82a0",
      roughness: 0.58,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    other: new THREE.MeshStandardMaterial({
      color: "#8b9a73",
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
    line: new THREE.LineBasicMaterial({ color: "#f5d28c" }),
    point: new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.7 }),
  };
  const markerTemplate = new THREE.SphereGeometry(markerRadius, 10, 8);
  const buckets: GeometryBuckets = {
    buildingRoof: [],
    buildingWall: [],
    water: [],
    other: [],
    line: [],
    point: [],
  };

  let objectCount = 0;
  for (const feature of features) {
    objectCount += addFeature(feature, projection, buckets, markerTemplate);
  }

  addMergedMesh(group, buckets.buildingRoof, materials.buildingRoof);
  addMergedMesh(group, buckets.buildingWall, materials.buildingWall);
  addMergedMesh(group, buckets.water, materials.water);
  addMergedMesh(group, buckets.other, materials.other);
  addMergedLineSegments(group, buckets.line, materials.line);
  addMergedMesh(group, buckets.point, materials.point);

  const halfWidth = projection.widthMeters * 0.5;
  const halfHeight = projection.heightMeters * 0.5;
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfWidth, 0.2, -halfHeight),
    new THREE.Vector3(halfWidth, 0.2, -halfHeight),
    new THREE.Vector3(halfWidth, 0.2, halfHeight),
    new THREE.Vector3(-halfWidth, 0.2, halfHeight),
  ]);
  const outlineMaterial = new THREE.LineBasicMaterial({ color: "#d1d5db" });
  group.add(new THREE.LineLoop(outlineGeometry, outlineMaterial));

  return {
    group,
    projection,
    objectCount,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
        }
      });

      for (const material of Object.values(materials)) {
        material.dispose();
      }
      markerTemplate.dispose();
      outlineMaterial.dispose();
    },
  };
}
