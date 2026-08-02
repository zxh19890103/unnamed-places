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

const BUILDING_TEXTURE_REPEAT_METERS = 10;
const BUILDING_TEXTURE_PATH = "/textures/houses.jpeg";
const ROOF_DIRTY_RED = "#7a2f24";
const HIGHWAY_THICKNESS_METERS = 0.28;
const HIGHWAY_ELEVATION_METERS = 0.42;
const LANE_WIDTH_METERS = 3.5;
const DEFAULT_HIGHWAY_WIDTH_METERS = 4;

const HIGHWAY_TYPE_WIDTH_HINTS: Record<string, number> = {
  motorway: 8.5,
  trunk: 7.5,
  primary: 6.5,
  secondary: 5.75,
  tertiary: 5,
  unclassified: 4.25,
  residential: 4,
  living_street: 3.25,
  service: 3,
  road: 4,
  track: 2.5,
  path: 1.5,
  footway: 1.2,
  cycleway: 1.6,
  pedestrian: 2,
  steps: 1,
  bus_guideway: 4,
  corridor: 2,
};

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

type BuildingPalette = {
  roof: string;
  wall: string;
};

const DEFAULT_BUILDING_PALETTE: BuildingPalette = {
  roof: "#e7c9a8",
  wall: "#ffffff",
};

const BUILDING_TYPE_COLOR_HINTS: Record<string, BuildingPalette> = {
  house: { roof: "#d96f62", wall: "#f2ddc7" },
  detached: { roof: "#c96357", wall: "#edd7c0" },
  bungalow: { roof: "#b66a4f", wall: "#e5d0bb" },
  hut: { roof: "#8a5a3f", wall: "#ccb59d" },
  cabin: { roof: "#7c543c", wall: "#c7b19b" },
  residential: { roof: "#b87366", wall: "#e9d7c7" },
  terrace: { roof: "#a96a5f", wall: "#dfcfbf" },
  apartments: { roof: "#7f8793", wall: "#d8dde3" },
  dormitory: { roof: "#6f7885", wall: "#d2d9e0" },
  office: { roof: "#54687f", wall: "#c6d4e3" },
  commercial: { roof: "#6f747f", wall: "#d7d3cf" },
  retail: { roof: "#85655f", wall: "#e2cbc1" },
  industrial: { roof: "#696f74", wall: "#b9c0c7" },
  warehouse: { roof: "#5e6469", wall: "#aeb6be" },
  school: { roof: "#a06452", wall: "#e4cfbe" },
  university: { roof: "#7e5f7f", wall: "#ddd0df" },
  hospital: { roof: "#6c8491", wall: "#d4e4ea" },
  hotel: { roof: "#7d5c4f", wall: "#ead8cb" },
  church: { roof: "#8e6f56", wall: "#e5d8c6" },
  cathedral: { roof: "#6f6760", wall: "#d4cec5" },
  mosque: { roof: "#60817c", wall: "#d1e2de" },
  synagogue: { roof: "#766985", wall: "#d9d2e4" },
  government: { roof: "#617189", wall: "#d4dce8" },
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
  | "highway"
  | "line"
  | "point";

type GeometryBuckets = Record<GeometryKind, THREE.BufferGeometry[]>;

type BuildingVariant = {
  key: string;
  palette: BuildingPalette;
};

type BuildingVariantBucket = {
  variant: BuildingVariant;
  roofFlat: THREE.BufferGeometry[];
  roofRidge: THREE.BufferGeometry[];
  wall: THREE.BufferGeometry[];
};

type RoofStyle = "flat";

function splitBuildingGeometryByFaceType(
  geometry: THREE.BufferGeometry,
  roofStyle: RoofStyle,
): {
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

  const roofTriangles: Array<{
    a: THREE.Vector3;
    b: THREE.Vector3;
    c: THREE.Vector3;
  }> = [];
  const roofFlatPositions: number[] = [];
  const wallPositions: number[] = [];
  const wallNormals: number[] = [];
  const wallUvs: number[] = [];

  for (let base = 0; base < position.count; base += 3) {
    const ny0 = normal.getY(base);
    const ny1 = normal.getY(base + 1);
    const ny2 = normal.getY(base + 2);
    const isRoofTriangle =
      (Math.abs(ny0) + Math.abs(ny1) + Math.abs(ny2)) / 3 > 0.7;

    if (isRoofTriangle) {
      roofFlatPositions.push(
        position.getX(base),
        position.getY(base),
        position.getZ(base),
        position.getX(base + 1),
        position.getY(base + 1),
        position.getZ(base + 1),
        position.getX(base + 2),
        position.getY(base + 2),
        position.getZ(base + 2),
      );
      roofTriangles.push({
        a: new THREE.Vector3(
          position.getX(base),
          position.getY(base),
          position.getZ(base),
        ),
        b: new THREE.Vector3(
          position.getX(base + 1),
          position.getY(base + 1),
          position.getZ(base + 1),
        ),
        c: new THREE.Vector3(
          position.getX(base + 2),
          position.getY(base + 2),
          position.getZ(base + 2),
        ),
      });
      continue;
    }

    for (let offset = 0; offset < 3; offset += 1) {
      const index = base + offset;
      wallPositions.push(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      );
      wallNormals.push(
        normal.getX(index),
        normal.getY(index),
        normal.getZ(index),
      );
      if (uv) {
        wallUvs.push(uv.getX(index), uv.getY(index));
      }
    }
  }

  const roofPositions: number[] = [];
  const roofNormals: number[] = [];

  roofPositions.push(...roofFlatPositions);

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
    if (normals.length === positions.length) {
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(normals, 3),
      );
    }
    if (uvs.length > 0) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    }
    if (normals.length !== positions.length) {
      geometry.computeVertexNormals();
    }
    return geometry;
  };

  return {
    roof: createGeometry(roofPositions, roofNormals, []),
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

  const normalizedType = readNormalizedBuildingType(feature);
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

function readNormalizedBuildingType(feature: GeoJSON.Feature): string {
  const rawType =
    readFeatureString(feature, "building") ??
    readFeatureString(feature, "building:use") ??
    readFeatureString(feature, "amenity") ??
    "";

  const normalized = rawType.toLowerCase().trim();
  if (!normalized) {
    return "";
  }

  return normalized.split(";")[0]?.trim() ?? normalized;
}

function buildingVariantForFeature(feature: GeoJSON.Feature): BuildingVariant {
  const type = readNormalizedBuildingType(feature);
  const palette = BUILDING_TYPE_COLOR_HINTS[type] ?? DEFAULT_BUILDING_PALETTE;
  return {
    key: `${palette.roof}|${palette.wall}`,
    palette,
  };
}

function getOrCreateBuildingBucket(
  buildingBuckets: Map<string, BuildingVariantBucket>,
  variant: BuildingVariant,
): BuildingVariantBucket {
  const existing = buildingBuckets.get(variant.key);
  if (existing) {
    return existing;
  }

  const created: BuildingVariantBucket = {
    variant,
    roofFlat: [],
    roofRidge: [],
    wall: [],
  };
  buildingBuckets.set(variant.key, created);
  return created;
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
  roofStyle?: RoofStyle;
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

  return {
    kind,
    geometry,
    roofStyle: "flat",
  };
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

function highwayWidthFromType(feature: GeoJSON.Feature): number {
  const highwayType = readFeatureString(feature, "highway")
    ?.toLowerCase()
    .trim();
  if (!highwayType) {
    return DEFAULT_HIGHWAY_WIDTH_METERS;
  }

  const normalizedType = highwayType.split(";")[0]?.trim() ?? highwayType;
  return (
    HIGHWAY_TYPE_WIDTH_HINTS[normalizedType] ?? DEFAULT_HIGHWAY_WIDTH_METERS
  );
}

function getHighwayWidthMeters(feature: GeoJSON.Feature): number {
  const explicitWidth = readFeatureNumber(feature, "width");
  if (explicitWidth !== null && explicitWidth > 0) {
    return explicitWidth;
  }

  const lanes = readFeatureNumber(feature, "lanes");
  if (lanes !== null && lanes > 0) {
    return Math.max(DEFAULT_HIGHWAY_WIDTH_METERS, lanes * LANE_WIDTH_METERS);
  }

  return highwayWidthFromType(feature);
}

function addHighwaySegment(
  points: THREE.Vector3[],
  widthMeters: number,
): THREE.BufferGeometry | null {
  const shape = new THREE.Shape();

  shape.moveTo(0, -widthMeters * 0.5);
  shape.lineTo(0, widthMeters * 0.5);

  const path = new THREE.CatmullRomCurve3(points, false, "centripetal");

  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 12,
    steps: 1,
    extrudePath: path,
  });

  return geometry;
}

function addHighwayGeometry(
  feature: GeoJSON.Feature,
  coordinates: GeoJSON.Position[],
  projection: TileProjection,
): THREE.BufferGeometry[] {
  if (coordinates.length < 2) {
    return [];
  }

  const widthMeters = getHighwayWidthMeters(feature);
  const geometries: THREE.BufferGeometry[] = [];

  const points = coordinates.map((coord) => {
    const xz = projection.project(coord);
    return new THREE.Vector3(xz.x, 0, xz.z);
  });

  const geometry = addHighwaySegment(points, widthMeters);

  if (geometry) {
    geometries.push(geometry);
  }

  return geometries;
}

function isHighwayFeature(feature: GeoJSON.Feature): boolean {
  return readFeatureString(feature, "highway") !== null;
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

function applyPatternOnlyTextureTint(
  material: THREE.MeshStandardMaterial,
): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float patternLuma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  // Darker, dirtier modulation while preserving texture contrast.
  float patternFactor = mix(0.2, 0.9, patternLuma);
  diffuseColor.rgb *= patternFactor;
  // diffuseColor.rgb *= vec3(0.88, 0.82, 0.76);
#endif`,
    );
  };
  material.customProgramCacheKey = () => "pattern-only-wall-map-v1";
  material.needsUpdate = true;
}

function addFeature(
  feature: GeoJSON.Feature,
  projection: TileProjection,
  buckets: GeometryBuckets,
  buildingBuckets: Map<string, BuildingVariantBucket>,
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
        const buildingBucket = getOrCreateBuildingBucket(
          buildingBuckets,
          buildingVariantForFeature(feature),
        );
        const split = splitBuildingGeometryByFaceType(
          polygon.geometry,
          polygon.roofStyle ?? "flat",
        );
        polygon.geometry.dispose();
        if (split.roof) {
          buildingBucket.roofFlat.push(split.roof);
        }
        if (split.wall) {
          buildingBucket.wall.push(split.wall);
        }
      } else {
        buckets[polygon.kind].push(polygon.geometry);
      }
      return 1;
    }
    case "MultiPolygon": {
      const buildingBucket = getOrCreateBuildingBucket(
        buildingBuckets,
        buildingVariantForFeature(feature),
      );
      return geometry.coordinates.reduce((count, polygon) => {
        const shape = addPolygon(feature, polygon, projection);
        if (!shape) {
          return count;
        }
        if (shape.kind === "building") {
          const split = splitBuildingGeometryByFaceType(
            shape.geometry,
            shape.roofStyle ?? "flat",
          );
          shape.geometry.dispose();
          if (split.roof) {
            buildingBucket.roofFlat.push(split.roof);
          }
          if (split.wall) {
            buildingBucket.wall.push(split.wall);
          }
        } else {
          buckets[shape.kind].push(shape.geometry);
        }
        return count + 1;
      }, 0);
    }
    case "LineString": {
      const line = addLine(geometry.coordinates, projection);
      if (!line) {
        return 0;
      }
      if (isHighwayFeature(feature)) {
        buckets.highway.push(
          ...addHighwayGeometry(feature, geometry.coordinates, projection),
        );
        line.dispose();
      } else {
        buckets.line.push(line);
      }
      return 1;
    }
    case "MultiLineString":
      return geometry.coordinates.reduce((count, line) => {
        const geometry = addLine(line, projection);
        if (!geometry) {
          return count;
        }
        if (isHighwayFeature(feature)) {
          buckets.highway.push(
            ...addHighwayGeometry(feature, line, projection),
          );
          geometry.dispose();
        } else {
          buckets.line.push(geometry);
        }
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
  const disposableMaterials: Array<THREE.Material> = [];
  const materials = {
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
    highway: new THREE.MeshStandardMaterial({
      color: "#f59e0b",
      roughness: 0.88,
      metalness: 0.02,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
    line: new THREE.LineBasicMaterial({ color: "#f5d28c" }),
    point: new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.7 }),
  };
  disposableMaterials.push(
    materials.water,
    materials.other,
    materials.highway,
    materials.line,
    materials.point,
  );
  const markerTemplate = new THREE.SphereGeometry(markerRadius, 10, 8);
  const buckets: GeometryBuckets = {
    buildingRoof: [],
    buildingWall: [],
    water: [],
    other: [],
    highway: [],
    line: [],
    point: [],
  };
  const buildingBuckets = new Map<string, BuildingVariantBucket>();

  let objectCount = 0;
  for (const feature of features) {
    objectCount += addFeature(
      feature,
      projection,
      buckets,
      buildingBuckets,
      markerTemplate,
    );
  }

  for (const bucket of buildingBuckets.values()) {
    const roofFlatMaterial = new THREE.MeshStandardMaterial({
      color: bucket.variant.palette.roof,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const roofRidgeMaterial = new THREE.MeshStandardMaterial({
      color: ROOF_DIRTY_RED,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: bucket.variant.palette.wall,
      ...(buildingTexture ? { map: buildingTexture } : {}),
      roughness: 0.88,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    if (buildingTexture) {
      applyPatternOnlyTextureTint(wallMaterial);
    }
    disposableMaterials.push(roofFlatMaterial, roofRidgeMaterial, wallMaterial);
    addMergedMesh(group, bucket.roofFlat, roofFlatMaterial);
    addMergedMesh(group, bucket.roofRidge, roofRidgeMaterial);
    addMergedMesh(group, bucket.wall, wallMaterial);
  }

  addMergedMesh(group, buckets.water, materials.water);
  addMergedMesh(group, buckets.other, materials.other);
  const highwaysGroup = new THREE.Group();
  highwaysGroup.name = `tile-highways-${tile.z}-${tile.x}-${tile.y}`;
  addMergedMesh(highwaysGroup, buckets.highway, materials.highway);
  group.add(highwaysGroup);
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

      for (const material of disposableMaterials) {
        material.dispose();
      }
      markerTemplate.dispose();
      outlineMaterial.dispose();
    },
  };
}
