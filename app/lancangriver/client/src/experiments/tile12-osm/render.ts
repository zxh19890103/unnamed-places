import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { TileCoords } from "../../osm/tiles";
import {
  classifyPolygonFeature,
  createTileProjection,
  PolygonFeatureKind,
  readFeatureNumber,
  type TileProjection,
} from "./tile";
import { BASE_URL } from "../../calc/constants";
import { RoofStyle } from "./_types";
import { create_geometry_roof, resolveBuildingRoofStyle } from "./roofs";
import { shaderGlslSegments, uniformSettings } from "./_cfg";

type TileVectorGroup = {
  group: THREE.Group;
  projection: TileProjection;
  objectCount: number;
  getHighwayBWMask: () => THREE.CanvasTexture;
  dispose: () => void;
};

const METERS_PER_LEVEL = 3.2;
const RANDOM_HEIGHT_MIN = 6;
const RANDOM_HEIGHT_MAX = 45;
const EARTH_RADIUS_METERS = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;

const MIN_GUESSED_BUILDING_HEIGHT_METERS = 8;
const MAX_GUESSED_BUILDING_HEIGHT_METERS = 120;
const FOOTPRINT_HEIGHT_SCALE = 1.8;

const BUILDING_TEXTURE_REPEAT_METERS = 10;

const BUILDING_TEXTURE_PATH =
  "/textures/SPR-hide-flaws-with-stipple-texture.jpg";
const BUILDING_TEXTURE_GRID = new THREE.Vector2(3, 2);
const BUILDING_ATLAS_UV_INSET = new THREE.Vector2(0.1, 0.1);
const BUILDING_WALL_TEXTURE_UV_SCALE = 2.0;
const BUILDING_FACE_MIN_HORIZONTAL_LENGTH_METERS = 12;

const LANE_WIDTH_METERS = 3.5;
const DEFAULT_HIGHWAY_WIDTH_METERS = 4;
const HIGHWAY_WIDTH_METERS_SCALE = 1.2;

const HIGHWAY_TYPE_WIDTH_HINTS: Record<string, number> = {
  motorway: 7.5,
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
  face: string;
};

const DEFAULT_BUILDING_PALETTE: BuildingPalette = {
  roof: "#e7c9a8",
  face: "#afe01a",
  wall: "#ffffff",
};

const BUILDING_TYPE_COLOR_HINTS: Record<string, BuildingPalette> = {
  house: { roof: "#d96f62", wall: "#f2ddc7", face: "#f00" },
  detached: { roof: "#c96357", wall: "#edd7c0", face: "#f00" },
  bungalow: { roof: "#b66a4f", wall: "#e5d0bb", face: "#f00" },
  hut: { roof: "#8a5a3f", wall: "#ccb59d", face: "#f00" },
  cabin: { roof: "#7c543c", wall: "#c7b19b", face: "#f00" },
  residential: { roof: "#b87366", wall: "#e9d7c7", face: "#f00" },
  terrace: { roof: "#a96a5f", wall: "#dfcfbf", face: "#f00" },
  apartments: { roof: "#7f8793", wall: "#d8dde3", face: "#f00" },
  dormitory: { roof: "#6f7885", wall: "#d2d9e0", face: "#f00" },
  office: { roof: "#54687f", wall: "#c6d4e3", face: "#f00" },
  commercial: { roof: "#6f747f", wall: "#d7d3cf", face: "#f00" },
  retail: { roof: "#85655f", wall: "#e2cbc1", face: "#f00" },
  industrial: { roof: "#696f74", wall: "#b9c0c7", face: "#f00" },
  warehouse: { roof: "#5e6469", wall: "#aeb6be", face: "#f00" },
  school: { roof: "#a06452", wall: "#e4cfbe", face: "#f00" },
  university: { roof: "#7e5f7f", wall: "#ddd0df", face: "#f00" },
  hospital: { roof: "#6c8491", wall: "#d4e4ea", face: "#f00" },
  hotel: { roof: "#7d5c4f", wall: "#ead8cb", face: "#f00" },
  church: { roof: "#8e6f56", wall: "#e5d8c6", face: "#f00" },
  cathedral: { roof: "#6f6760", wall: "#d4cec5", face: "#f00" },
  mosque: { roof: "#60817c", wall: "#d1e2de", face: "#f00" },
  synagogue: { roof: "#766985", wall: "#d9d2e4", face: "#f00" },
  government: { roof: "#617189", wall: "#d4dce8", face: "#f00" },
};

let cachedBuildingTexture: THREE.Texture | null | undefined;

function getBuildingTexture(
  textureLoader: THREE.TextureLoader,
): THREE.Texture | null {
  if (cachedBuildingTexture !== undefined) {
    return cachedBuildingTexture;
  }

  // Vitest/node does not provide browser image loading for TextureLoader.
  if (typeof window === "undefined") {
    cachedBuildingTexture = null;
    return cachedBuildingTexture;
  }

  const texture = textureLoader.load(BUILDING_TEXTURE_PATH);
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  // texture.colorSpace = THREE.SRGBColorSpace;
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

function createBuildingMetadataAttribute(
  positionAttr:
    | THREE.BufferAttribute<THREE.BufferAttributeEventMap>
    | THREE.InterleavedBufferAttribute,
  projectiton: TileProjection,
  textureGrid: THREE.Vector2,
): THREE.Float32BufferAttribute {
  const itemSize = 4;

  const metadata = new Float32Array(positionAttr.count * itemSize);

  const offsetX = Math.floor(Math.random() * textureGrid.x);
  const offsetY = Math.floor(Math.random() * textureGrid.y);

  for (let index = 0; index < positionAttr.count; index += 1) {
    const base = index * itemSize;

    const x = positionAttr.getX(index);
    const z = positionAttr.getZ(index);

    metadata[base] = offsetX;
    metadata[base + 1] = offsetY;

    metadata[base + 2] = x / projectiton.widthMeters + 0.5;
    metadata[base + 3] = z / projectiton.heightMeters + 0.5;
  }

  return new THREE.Float32BufferAttribute(metadata, itemSize);
}

function ensureMetadataAttribute(
  geometry: THREE.BufferGeometry,
  projection: TileProjection,
  textureGrid: THREE.Vector2,
): void {
  const position = geometry.getAttribute("position");

  if (!position) {
    return;
  }

  geometry.setAttribute(
    "metadata",
    createBuildingMetadataAttribute(position, projection, textureGrid),
  );
}

type GeometryKind =
  | "buildingRoof"
  | "buildingWall"
  | "buildingFace"
  | "water"
  | "other"
  | "highway"
  | "river"
  | "highway2"
  | "line"
  | "point";

type HighwayGeometryEntry = {
  geometry: THREE.BufferGeometry;
  widthMeters: number;
  offGroundMeters: number;
  centerline: THREE.Vector3[];
};

type GeometryBuckets = Omit<
  Record<GeometryKind, THREE.BufferGeometry[]>,
  "highway"
> & {
  highway: HighwayGeometryEntry[];
};

type BuildingVariant = {
  key: string;
  palette: BuildingPalette;
};

type BuildingVariantBucket = {
  variant: BuildingVariant;
  roof: THREE.BufferGeometry[];
  wall: THREE.BufferGeometry[];
  face: THREE.BufferGeometry[];
};

type BuildingFaceType = "wall" | "roof" | "face";

type BuildingSplitSegments = {
  roof: THREE.BufferGeometry | null;
  /**
   * walls that are solid without windows,
   * render with pure colors.
   */
  wall: THREE.BufferGeometry | null;
  /**
   * walls with windows / doors,
   * sometimes a building may only have face walls.
   */
  face: THREE.BufferGeometry | null;
};

const resolveBuildingFaceType = (
  normal0: THREE.Vector3,
  normal1: THREE.Vector3,
  normal2: THREE.Vector3,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
): BuildingFaceType => {
  const isRoofTriangle =
    (Math.abs(normal0.x) + Math.abs(normal1.y) + Math.abs(normal2.z)) / 3 > 0.7;

  if (isRoofTriangle) return "roof";

  const edge01HorizontalLength = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const edge12HorizontalLength = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  const edge20HorizontalLength = Math.hypot(p0.x - p2.x, p0.z - p2.z);

  const horizontalLength = Math.max(
    edge01HorizontalLength,
    edge12HorizontalLength,
    edge20HorizontalLength,
  );

  if (horizontalLength >= BUILDING_FACE_MIN_HORIZONTAL_LENGTH_METERS) {
    return "face";
  }

  return "wall";
};

function splitBuildingGeometryByFaceType(
  geometry: THREE.BufferGeometry,
  roofStyle: RoofStyle,
): BuildingSplitSegments {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");

  if (!position || !normal) {
    source.dispose();
    return { roof: null, wall: null, face: null };
  }

  const normal0 = new THREE.Vector3();
  const normal1 = new THREE.Vector3();
  const normal2 = new THREE.Vector3();

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();

  const roofPositions: number[] = [];
  const roofNormals: number[] = [];

  const wallPositions: number[] = [];
  const wallNormals: number[] = [];
  const wallUvs: number[] = [];

  const facePositions: number[] = [];
  const faceNormals: number[] = [];
  const faceUvs: number[] = [];

  for (let base = 0; base < position.count; base += 3) {
    const nx0 = normal.getY(base);
    const ny0 = normal.getY(base);
    const nz0 = normal.getY(base);

    const nx1 = normal.getY(base + 1);
    const ny1 = normal.getY(base + 1);
    const nz1 = normal.getY(base + 1);

    const nx2 = normal.getY(base + 2);
    const ny2 = normal.getY(base + 2);
    const nz2 = normal.getY(base + 2);

    normal0.set(nx0, ny0, nz0);
    normal1.set(nx1, ny1, nz1);
    normal2.set(nx2, ny2, nz2);

    p0.set(
      position.getX(base + 0),
      position.getY(base + 0),
      position.getZ(base + 0),
    );

    p1.set(
      position.getX(base + 1),
      position.getY(base + 1),
      position.getZ(base + 1),
    );

    p2.set(
      position.getX(base + 2),
      position.getY(base + 2),
      position.getZ(base + 2),
    );

    const faceType = resolveBuildingFaceType(
      normal0,
      normal1,
      normal2,
      p0,
      p1,
      p2,
    );

    if (faceType === "roof") {
      // Only push if normal points upward (+y), not downward (base)
      const avgNormalY = (normal0.y + normal1.y + normal2.y) / 3;
      if (avgNormalY > 0) {
        roofPositions.push(
          p0.x,
          p0.y,
          p0.z,
          p1.x,
          p1.y,
          p1.z,
          p2.x,
          p2.y,
          p2.z,
        );
        roofNormals.push(
          normal0.x,
          normal0.y,
          normal0.z,
          normal1.x,
          normal1.y,
          normal1.z,
          normal2.x,
          normal2.y,
          normal2.z,
        );
      }
    } else if (faceType === "wall") {
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
    } else if (faceType === "face") {
      for (let offset = 0; offset < 3; offset += 1) {
        const index = base + offset;

        facePositions.push(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        );

        faceNormals.push(
          normal.getX(index),
          normal.getY(index),
          normal.getZ(index),
        );

        if (uv) {
          faceUvs.push(uv.getX(index), uv.getY(index));
        }
      }
    }
  }

  source.dispose();

  const styledRoofGeometryFactory = create_geometry_roof[roofStyle];

  const defaultGeometryFactory = (positions: number[]) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    return geometry;
  };

  const createGeometry = (
    isRoof: boolean,
    positions: number[],
    normals: number[],
    uvs: number[],
  ): THREE.BufferGeometry | null => {
    if (positions.length === 0) {
      return null;
    }

    let geometry: THREE.BufferGeometry = null;
    if (isRoof) {
      geometry = styledRoofGeometryFactory(positions);
      geometry.computeVertexNormals();
    } else {
      geometry = defaultGeometryFactory(positions);

      if (normals.length === positions.length) {
        geometry.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(normals, 3),
        );
      } else {
        geometry.computeVertexNormals();
      }
    }

    if (uvs.length > 0) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    }

    return geometry;
  };

  const roofGeometry = createGeometry(true, roofPositions, roofNormals, []);

  const wallGeometry = createGeometry(
    false,
    wallPositions,
    wallNormals,
    wallUvs,
  );

  const faceGeometry = createGeometry(
    false,
    facePositions,
    faceNormals,
    faceUvs,
  );

  return {
    roof: roofGeometry,
    wall: wallGeometry,
    face: faceGeometry,
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

function ringAreaSquareMeters(ring: GeoJSON.Position[]): number {
  const end = ring.length > 1 ? ring.length - 1 : ring.length;
  if (end < 3) {
    return 0;
  }

  const refLon = Number(ring[0]?.[0] ?? 0);
  const latitudes = ring.slice(0, end).map((position) => Number(position[1]));
  if (latitudes.some((latitude) => !Number.isFinite(latitude))) {
    return 0;
  }

  const refLat =
    latitudes.reduce((sum, latitude) => sum + latitude, 0) / latitudes.length;
  const cosRefLat = Math.cos(refLat * DEG_TO_RAD);

  const project = (position: GeoJSON.Position): { x: number; y: number } => {
    const lon = Number(position[0]);
    const lat = Number(position[1]);
    return {
      x: (lon - refLon) * DEG_TO_RAD * EARTH_RADIUS_METERS * cosRefLat,
      y: lat * DEG_TO_RAD * EARTH_RADIUS_METERS,
    };
  };

  let twiceArea = 0;
  for (let index = 0; index < end; index += 1) {
    const current = project(ring[index]);
    const next = project(ring[(index + 1) % end]);
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(twiceArea) * 0.5;
}

function polygonAreaSquareMeters(rings: GeoJSON.Position[][]): number {
  if (rings.length === 0) {
    return 0;
  }

  const outer = ringAreaSquareMeters(rings[0]);
  const holes = rings
    .slice(1)
    .reduce((sum, hole) => sum + ringAreaSquareMeters(hole), 0);
  return Math.max(outer - holes, 0);
}

function featureFootprintAreaSquareMeters(
  feature: GeoJSON.Feature,
): number | null {
  const geometry = feature.geometry;
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return polygonAreaSquareMeters(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    const area = geometry.coordinates.reduce(
      (sum, polygon) => sum + polygonAreaSquareMeters(polygon),
      0,
    );
    return Math.max(area, 0);
  }

  return null;
}

function guessedHeightCapFromFootprint(
  areaSquareMeters: number | null,
): number {
  if (
    areaSquareMeters === null ||
    !Number.isFinite(areaSquareMeters) ||
    areaSquareMeters <= 0
  ) {
    return MAX_GUESSED_BUILDING_HEIGHT_METERS;
  }

  const cap =
    MIN_GUESSED_BUILDING_HEIGHT_METERS +
    Math.sqrt(areaSquareMeters) * FOOTPRINT_HEIGHT_SCALE;
  return Math.min(
    MAX_GUESSED_BUILDING_HEIGHT_METERS,
    Math.max(MIN_GUESSED_BUILDING_HEIGHT_METERS, cap),
  );
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
  const guessedHeightCap = guessedHeightCapFromFootprint(
    featureFootprintAreaSquareMeters(feature),
  );

  const normalizedType = readNormalizedBuildingType(feature);
  const inferredLevels =
    BUILDING_TYPE_LEVEL_HINTS[normalizedType] ??
    BUILDING_TYPE_LEVEL_HINTS[
      normalizedType.split(";")[0]?.trim() ?? normalizedType
    ];

  if (inferredLevels !== undefined) {
    const inferredHeight = (inferredLevels + roofLevels) * METERS_PER_LEVEL;
    return minHeight + Math.min(inferredHeight, guessedHeightCap);
  }

  const fallback = randomHeightForFeature(
    feature,
    RANDOM_HEIGHT_MIN,
    RANDOM_HEIGHT_MAX,
  );

  const guessedHeight = fallback + roofLevels * METERS_PER_LEVEL;
  return minHeight + Math.min(guessedHeight, guessedHeightCap);
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
    roof: [],
    wall: [],
    face: [],
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
  kind: PolygonFeatureKind;
  geometry: THREE.BufferGeometry;
  roofStyle?: RoofStyle;
} | null {
  const shape = polygonShape(rings, projection);
  if (!shape) {
    return null;
  }

  const kind = classifyPolygonFeature(feature);
  let geometry: THREE.BufferGeometry;

  let roofStyle: RoofStyle = null;

  if (kind === "building") {
    const buildingHeightMeters = Math.max(1, buildingHeight(feature));

    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: buildingHeightMeters,
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1,
    });

    geometry.rotateX(-Math.PI / 2);
    roofStyle = resolveBuildingRoofStyle(feature, buildingHeightMeters);
  } else {
    if (kind === "other") {
      console.log(feature.properties.highway);
    }

    geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);

    const positionAttr = geometry.getAttribute("position");
    if (positionAttr) {
      const gisUv = new Float32Array(positionAttr.count * 2);
      for (let index = 0; index < positionAttr.count; index += 1) {
        gisUv[index * 2 + 0] =
          positionAttr.getX(index) / projection.widthMeters + 0.5;
        gisUv[index * 2 + 1] =
          positionAttr.getZ(index) / projection.heightMeters + 0.5;
      }
      geometry.setAttribute("gisUv", new THREE.BufferAttribute(gisUv, 2));
    }
  }

  if (kind === "building") {
    applyBuildingRepeatUv(geometry);
  } else {
    geometry.translate(0, kind === "water" ? 0.1 : 0.05, 0);
  }

  return {
    kind,
    geometry,
    roofStyle: roofStyle,
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

type HighwayCenterlineSample = {
  point: THREE.Vector3;
  cumulativeDistance: number;
};

function buildHighwayCenterlineSamples(
  path: THREE.CatmullRomCurve3,
  distanceMeters: number,
): HighwayCenterlineSample[] {
  const sampleCount = Math.max(8, Math.ceil(distanceMeters / 2));
  const sampledPoints = path.getSpacedPoints(sampleCount);

  if (sampledPoints.length < 2) {
    return [
      { point: new THREE.Vector3(), cumulativeDistance: 0 },
      { point: new THREE.Vector3(0, 0, 0.001), cumulativeDistance: 0.001 },
    ];
  }

  const samples: HighwayCenterlineSample[] = [
    { point: sampledPoints[0].clone(), cumulativeDistance: 0 },
  ];

  let cumulativeDistance = 0;
  for (let index = 1; index < sampledPoints.length; index += 1) {
    cumulativeDistance += sampledPoints[index - 1].distanceTo(
      sampledPoints[index],
    );
    samples.push({
      point: sampledPoints[index].clone(),
      cumulativeDistance,
    });
  }

  return samples;
}

function projectPointToHighwayCenterline(
  point: THREE.Vector3,
  centerline: HighwayCenterlineSample[],
): { sMeters: number; tMeters: number } {
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  let bestSMeters = 0;
  let bestTMeters = 0;

  const delta = new THREE.Vector3();
  const fromStart = new THREE.Vector3();
  const closest = new THREE.Vector3();

  for (let index = 0; index < centerline.length - 1; index += 1) {
    const start = centerline[index];
    const end = centerline[index + 1];

    delta.subVectors(end.point, start.point);

    const segmentLengthSq = delta.lengthSq();

    if (segmentLengthSq <= 1e-8) {
      continue;
    }

    fromStart.subVectors(point, start.point);

    const alongFactor = THREE.MathUtils.clamp(
      fromStart.dot(delta) / segmentLengthSq,
      0,
      1,
    );

    closest.copy(start.point).addScaledVector(delta, alongFactor);

    const distanceSq = point.distanceToSquared(closest);

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestSMeters = Math.sqrt(distanceSq);
      bestTMeters =
        start.cumulativeDistance + Math.sqrt(segmentLengthSq) * alongFactor;
    }
  }

  return { sMeters: bestSMeters, tMeters: bestTMeters };
}

function readExtrudeVertex(
  vertices: number[],
  index: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const base = index * 3;
  return target.set(vertices[base], vertices[base + 1], vertices[base + 2]);
}

function createHighwayUvGenerator(
  path: THREE.CatmullRomCurve3,
  visualWidthHalf: number,
  distanceMeters: number,
): THREE.ExtrudeGeometryOptions["UVGenerator"] {
  const centerline = buildHighwayCenterlineSamples(path, distanceMeters);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();

  const metersToVScale = 0.1;

  const uvFor = (side: 0 | 1, vertex: THREE.Vector3): THREE.Vector2 => {
    const projection = projectPointToHighwayCenterline(vertex, centerline);

    const u = side;
    const v = projection.tMeters * metersToVScale;

    return new THREE.Vector2(u, v);
  };

  return {
    generateTopUV: (_geometry, vertices, indexA, indexB, indexC) => [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
    ],
    generateSideWallUV: (
      _geometry,
      vertices,
      indexA,
      indexB,
      indexC,
      indexD,
    ) => {
      readExtrudeVertex(vertices, indexA, a); // bottom left
      readExtrudeVertex(vertices, indexB, b); // bottom right
      readExtrudeVertex(vertices, indexC, c); // top right
      readExtrudeVertex(vertices, indexD, d); // top left

      return [uvFor(0, a), uvFor(1, b), uvFor(1, c), uvFor(0, d)];
    },
  };
}

function addHighwaySegment(
  points: THREE.Vector3[],
  widthMeters: number,
  tileExtent: THREE.Vector2,
): THREE.BufferGeometry | null {
  const shape = new THREE.Shape();

  const visualWidthHalf = 0.5 * widthMeters * HIGHWAY_WIDTH_METERS_SCALE;

  shape.moveTo(0, -visualWidthHalf);
  shape.lineTo(0, visualWidthHalf);

  const path = new THREE.CatmullRomCurve3(points, false, "centripetal");

  const distance = points.reduce((s, p, i) => {
    if (!points[i + 1]) return s;
    return s + p.distanceTo(points[i + 1]);
  }, 0);

  if (!Number.isFinite(distance) || distance <= 0) {
    return null;
  }

  const uvGenerator = createHighwayUvGenerator(path, visualWidthHalf, distance);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 12,
    steps: Math.max(Math.ceil(distance / 20), 20),
    extrudePath: path,
    UVGenerator: uvGenerator,
  });

  const positionAttr = geometry.attributes.position;
  const gisUv = new Float32Array(positionAttr.count * 2);

  for (let i = 0; i < positionAttr.count; i++) {
    const x = positionAttr.getX(i);
    const z = positionAttr.getZ(i);

    gisUv[i * 2 + 0] = x / tileExtent.x + 0.5;
    gisUv[i * 2 + 1] = z / tileExtent.y + 0.5;
  }

  geometry.setAttribute("gisUv", new THREE.BufferAttribute(gisUv, 2));

  return geometry;
}

function addHighwayGeometry(
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
    const offGroundMeters = getHighwayOffGroundMeters(feature);
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

export function getHighwayOffGroundMeters(feature: GeoJSON.Feature) {
  const layer = readFeatureNumber(feature, "layer") ?? 0;

  const isBridge = hasTruthyFeatureFlag(feature, "bridge");
  const isTunnel = hasTruthyFeatureFlag(feature, "tunnel");
  const isCovered = hasTruthyFeatureFlag(feature, "covered");

  const location = readFeatureString(feature, "location")?.toLowerCase().trim();

  const hasBridgeLocation = location === "bridge";
  const hasTunnelLocation = location === "tunnel";

  const classBias = getHighwayClassOffset(feature);
  const layerBias = layer * 1.5;

  if (isTunnel || hasTunnelLocation) {
    return -2.5 + layerBias + classBias;
  }

  if (isBridge || hasBridgeLocation) {
    return 2.5 + layerBias + classBias;
  }

  let offGroundMeters = layerBias + classBias;

  if (readFeatureString(feature, "embankment")) {
    offGroundMeters += 0.5;
  }

  if (readFeatureString(feature, "cutting")) {
    offGroundMeters -= 0.5;
  }

  if (isCovered) {
    offGroundMeters -= 0.15;
  }

  return offGroundMeters;
}

function hasTruthyFeatureFlag(feature: GeoJSON.Feature, key: string): boolean {
  const value = readFeatureString(feature, key);
  if (value !== null) {
    const normalized = value.toLowerCase().trim();
    return normalized === "yes" || normalized === "true" || normalized === "1";
  }

  const numeric = readFeatureNumber(feature, key);
  if (numeric !== null) {
    return numeric !== 0;
  }

  const properties = feature.properties;
  if (!properties || typeof properties !== "object") {
    return false;
  }

  const direct = (properties as Record<string, unknown>)[key];
  return direct === true;
}

function getHighwayClassOffset(feature: GeoJSON.Feature): number {
  const type = readFeatureString(feature, "highway")?.toLowerCase().trim();

  if (!type) {
    return 0;
  }

  const normalizedType = type.split(";")[0]?.trim() ?? type;

  const offsets: Record<string, number> = {
    motorway: 0.22,
    trunk: 0.2,
    primary: 0.18,
    secondary: 0.16,
    tertiary: 0.14,
    unclassified: 0.12,
    residential: 0.1,
    living_street: 0.08,
    service: 0.06,
    road: 0.06,
    track: 0.04,
    path: 0.03,
    footway: 0.02,
    cycleway: 0.025,
    pedestrian: 0.02,
    steps: 0.01,
    bus_guideway: 0.12,
    corridor: 0.08,
  };

  return offsets[normalizedType] ?? 0;
}

function isHighwayFeature(feature: GeoJSON.Feature): boolean {
  const property = readFeatureString(feature, "highway");
  return property !== null && property !== undefined;
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
  material: THREE.Material,
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

function isRiverWaterFeature(feature: GeoJSON.Feature): boolean {
  const waterway = readFeatureString(feature, "waterway")?.toLowerCase().trim();
  const water = readFeatureString(feature, "water")?.toLowerCase().trim();
  const natural = readFeatureString(feature, "natural")?.toLowerCase().trim();

  if (waterway) {
    const normalized = waterway.split(";")[0]?.trim() ?? waterway;
    if (
      ["river", "stream", "canal", "drain", "ditch", "riverbank"].includes(
        normalized,
      )
    ) {
      return true;
    }
  }

  if (water) {
    const normalized = water.split(";")[0]?.trim() ?? water;
    if (["river", "stream", "canal"].includes(normalized)) {
      return true;
    }
  }

  return natural === "water" && Boolean(waterway);
}

function computePrincipalFlowFrame(
  positionAttr:
    | THREE.BufferAttribute<THREE.BufferAttributeEventMap>
    | THREE.InterleavedBufferAttribute,
): {
  centerX: number;
  centerZ: number;
  majorX: number;
  majorZ: number;
} | null {
  if (positionAttr.count < 2) {
    return null;
  }

  let sumX = 0;
  let sumZ = 0;
  for (let index = 0; index < positionAttr.count; index += 1) {
    sumX += positionAttr.getX(index);
    sumZ += positionAttr.getZ(index);
  }

  const centerX = sumX / positionAttr.count;
  const centerZ = sumZ / positionAttr.count;

  let covarianceXX = 0;
  let covarianceXZ = 0;
  let covarianceZZ = 0;

  for (let index = 0; index < positionAttr.count; index += 1) {
    const dx = positionAttr.getX(index) - centerX;
    const dz = positionAttr.getZ(index) - centerZ;

    covarianceXX += dx * dx;
    covarianceXZ += dx * dz;
    covarianceZZ += dz * dz;
  }

  const trace = covarianceXX + covarianceZZ;
  const determinant = covarianceXX * covarianceZZ - covarianceXZ * covarianceXZ;
  const discriminant = Math.max(trace * trace * 0.25 - determinant, 0);
  const majorEigenvalue = trace * 0.5 + Math.sqrt(discriminant);

  let majorX = majorEigenvalue - covarianceZZ;
  let majorZ = covarianceXZ;

  const length = Math.hypot(majorX, majorZ);
  if (!Number.isFinite(length) || length <= 1e-6) {
    if (covarianceXX >= covarianceZZ) {
      majorX = 1;
      majorZ = 0;
    } else {
      majorX = 0;
      majorZ = 1;
    }
  } else {
    majorX /= length;
    majorZ /= length;
  }

  return {
    centerX,
    centerZ,
    majorX,
    majorZ,
  };
}

export function buildWaterFlowUv(
  feature: GeoJSON.Feature,
  polygon: THREE.BufferGeometry,
): Float32Array {
  const itemSize = 2;
  const positionAttr = polygon.getAttribute("position");

  if (!positionAttr) {
    return new Float32Array(0);
  }

  const waterFlowUv = new Float32Array(positionAttr.count * itemSize);
  if (!isRiverWaterFeature(feature)) {
    return waterFlowUv;
  }

  const frame = computePrincipalFlowFrame(positionAttr);
  if (!frame) {
    return waterFlowUv;
  }

  const minorX = -frame.majorZ;
  const minorZ = frame.majorX;

  let minAlong = Number.POSITIVE_INFINITY;
  let maxAlong = Number.NEGATIVE_INFINITY;
  let minAcross = Number.POSITIVE_INFINITY;
  let maxAcross = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < positionAttr.count; index += 1) {
    const dx = positionAttr.getX(index) - frame.centerX;
    const dz = positionAttr.getZ(index) - frame.centerZ;

    const along = dx * frame.majorX + dz * frame.majorZ;
    const across = dx * minorX + dz * minorZ;

    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAcross = Math.min(minAcross, across);
    maxAcross = Math.max(maxAcross, across);
  }

  const alongRange = maxAlong - minAlong;
  const acrossRange = maxAcross - minAcross;

  if (alongRange <= 1e-6 || acrossRange <= 1e-6) {
    return waterFlowUv;
  }

  const mertersToUvScale = 0.01;

  for (let index = 0; index < positionAttr.count; index += 1) {
    const base = index * itemSize;

    const dx = positionAttr.getX(index) - frame.centerX;
    const dz = positionAttr.getZ(index) - frame.centerZ;

    const along = dx * frame.majorX + dz * frame.majorZ;
    const across = dx * minorX + dz * minorZ;

    waterFlowUv[base] = mertersToUvScale * (across - minAcross);
    waterFlowUv[base + 1] = mertersToUvScale * (along - minAlong);
  }

  return waterFlowUv;
}

function addWaterFlow(
  feature: GeoJSON.Feature,
  polygon: THREE.BufferGeometry,
): void {
  polygon.setAttribute(
    "flowUv",
    new THREE.BufferAttribute(buildWaterFlowUv(feature, polygon), 2),
  );
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
          polygon.roofStyle,
        );

        polygon.geometry.dispose();

        if (split.roof) {
          ensureMetadataAttribute(
            split.roof,
            projection,
            BUILDING_TEXTURE_GRID,
          );
          buildingBucket.roof.push(split.roof);
        }

        if (split.wall) {
          ensureMetadataAttribute(
            split.wall,
            projection,
            BUILDING_TEXTURE_GRID,
          );
          buildingBucket.wall.push(split.wall);
        }

        if (split.face) {
          ensureMetadataAttribute(
            split.face,
            projection,
            BUILDING_FACE_TEXTURE_GRID,
          );
          buildingBucket.face.push(split.face);
        }
      } else if (polygon.kind === "highway") {
        buckets.highway2.push(polygon.geometry);
      } else if (polygon.kind === "water") {
        if (isRiverWaterFeature(feature)) {
          addWaterFlow(feature, polygon.geometry);
          buckets.river.push(polygon.geometry);
        } else {
          addWaterFlow(feature, polygon.geometry);
          buckets.water.push(polygon.geometry);
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
            ensureMetadataAttribute(
              split.roof,
              projection,
              BUILDING_TEXTURE_GRID,
            );
            buildingBucket.roof.push(split.roof);
          }

          if (split.wall) {
            ensureMetadataAttribute(
              split.wall,
              projection,
              BUILDING_TEXTURE_GRID,
            );
            buildingBucket.wall.push(split.wall);
          }

          if (split.face) {
            ensureMetadataAttribute(
              split.face,
              projection,
              BUILDING_FACE_TEXTURE_GRID,
            );
            buildingBucket.face.push(split.face);
          }
        } else if (shape.kind === "highway") {
          buckets.highway2.push(shape.geometry);
        } else if (shape.kind === "water") {
          if (isRiverWaterFeature(feature)) {
            addWaterFlow(feature, shape.geometry);
            buckets.river.push(shape.geometry);
          } else {
            addWaterFlow(feature, shape.geometry);
            buckets.water.push(shape.geometry);
          }
        } else {
          // other
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

function createHighwayMaterial(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
) {
  const texture = textureLoader.load("/textures/highway.jpeg");

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      offGroundMeters: { value: 0 },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0 },
      color: { value: new THREE.Color("#3f444b") },
    },
    vertexShader: `
attribute vec2 gisUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;
uniform float offGroundMeters;

varying vec3 vNormal;
varying vec2 vUv;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vUv = uv;

  vNormal = normalize(normalMatrix * normal);

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 rgb = texture2D(terrianMap, gisUv);
    float heightMeters = decodeTerrariumHeight(rgb);
    displacePosition.y += heightMeters;
  }
  
  displacePosition.y += offGroundMeters;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform vec3 color;
uniform sampler2D map;

varying vec2 vUv;

void main() {
    float u = vUv.s;
    float v = vUv.t;

    vec4 baseColor = texture2D(map, vec2(u, v));
    gl_FragColor = vec4(baseColor.rgb, 1.0);
}
`,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  return material;
}

function createBuildingWallMaterial(
  color: string,
  texture: THREE.Texture | null,
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      useTexture: { value: texture !== null },
      baseColor: { value: new THREE.Color(color) },
      atlasGridSize: { value: BUILDING_TEXTURE_GRID.clone() },
      atlasUvInset: { value: BUILDING_ATLAS_UV_INSET },
      wallTextureUvScale: { value: BUILDING_WALL_TEXTURE_UV_SCALE },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec4 metadata;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec2 vAtlasGridIndex;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vUv = uv;
  vWorldNormal = normalize(normalMatrix * normal);
  vAtlasGridIndex = metadata.xy;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 gisTerrianRgb = texture2D(terrianMap, metadata.zw);
    float heightMeters = decodeTerrariumHeight(gisTerrianRgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform sampler2D map;
uniform bool useTexture;
uniform vec3 baseColor;
uniform vec2 atlasGridSize;
uniform vec2 atlasUvInset;
uniform vec3 lightDirection;
uniform float ambientStrength;
uniform float wallTextureUvScale;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec2 vAtlasGridIndex;

void main() {
  vec3 color = baseColor;

  if (useTexture) {
    // Keep lookups away from per-cell borders to avoid atlas bleeding seams.
    vec2 localUv = fract(vUv * wallTextureUvScale);
    localUv = localUv * (1.0 - atlasUvInset * 2.0) + atlasUvInset;
    vec2 atlasUv = (vAtlasGridIndex + localUv) / atlasGridSize;
    vec4 sampledDiffuseColor = texture2D(map, atlasUv);
    float patternLuma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float patternFactor = mix(0.7, 0.96, patternLuma);
    color *= patternFactor;
  }

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(lightDirection);
  
  if (!gl_FrontFacing) {
    normal *= -1.0;
  }
  
  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(color * lighting, 1.0);
}
`,
    side: THREE.DoubleSide,
  });

  return material;
}

const BUILDING_FACE_TEXTURE_GRID = new THREE.Vector2(6, 4);

function createBuildingFaceMaterial(
  color: string,
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  textureLoader
    .loadAsync(`/textures/building-face-atlas-v2.png`)
    .then((data) => {
      material.uniforms.map.value = data;
      material.uniforms.mapLoaded.value = true;
    });

  const BUILDING_ATLAS_UV_INSET = new THREE.Vector2(0, 0);
  const BUILDING_WALL_TEXTURE_UV_SCALE = 0.4;

  const material = new THREE.ShaderMaterial({
    wireframe: false,
    uniforms: {
      map: { value: null },
      mapLoaded: { value: false },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      baseColor: { value: new THREE.Color(color) },
      atlasGridSize: { value: BUILDING_FACE_TEXTURE_GRID.clone() },
      atlasUvInset: { value: BUILDING_ATLAS_UV_INSET },
      wallTextureUvScale: { value: BUILDING_WALL_TEXTURE_UV_SCALE },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec4 metadata;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec2 vAtlasGridIndex;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vUv = uv;
  vWorldNormal = normalize(normalMatrix * normal);
  vAtlasGridIndex = metadata.xy;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 gisTerrianRgb = texture2D(terrianMap, metadata.zw);
    float heightMeters = decodeTerrariumHeight(gisTerrianRgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform sampler2D map;
uniform bool mapLoaded;
uniform vec3 baseColor;
uniform vec2 atlasGridSize;
uniform vec2 atlasUvInset;
uniform vec3 lightDirection;
uniform float ambientStrength;
uniform float wallTextureUvScale;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec2 vAtlasGridIndex;

void main() {
  vec3 color = baseColor;

  if (mapLoaded) {
    // Keep lookups away from per-cell borders to avoid atlas bleeding seams.
    vec2 localUv = fract(vUv * wallTextureUvScale);
    localUv = localUv * (1.0 - atlasUvInset * 2.0) + atlasUvInset;
    vec2 atlasUv = (vAtlasGridIndex + localUv) / atlasGridSize;
    vec4 sampledDiffuseColor = texture2D(map, atlasUv);
    float patternLuma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float patternFactor = mix(0.7, 0.96, patternLuma);
    color = sampledDiffuseColor.rgb * patternFactor;
  }

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(lightDirection);
  
  if (!gl_FrontFacing) {
    normal *= -1.0;
  }
  
  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(color * lighting, 1.0);
}
`,
    side: THREE.DoubleSide,
  });

  return material;
}

function createRoofMaterial(
  palette: string,
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  const roofMap = textureLoader.load("/textures/roofs.jpg");

  const material = new THREE.ShaderMaterial({
    wireframe: false,
    uniforms: {
      map: { value: roofMap },
      baseColor: { value: new THREE.Color(palette) },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec4 metadata;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec3 vWorldNormal;
varying vec2 vUv;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vWorldNormal = normalize(normalMatrix * normal);

  vec3 displacePosition = position;
  vUv = uv;

  if (terrianMapLoaded > 0.5) {
    vec4 gisTerrianRgb = texture2D(terrianMap, metadata.zw);
    float heightMeters = decodeTerrariumHeight(gisTerrianRgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform vec3 baseColor;
uniform sampler2D map;
uniform vec3 lightDirection;
uniform float ambientStrength;

varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  vec4 color = texture2D(map, vUv);

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(lightDirection);

  if (!gl_FrontFacing) {
    normal *= -1.0;
  }

  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(color.rgb * lighting, 1.0);
}
`,
    side: THREE.DoubleSide,
  });

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  return material;
}

function createWaterMaterial(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  const map = textureLoader.load("/textures/istockphoto-118337676-612x612.jpg");

  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.MirroredRepeatWrapping;

  const normalsMap = textureLoader.load("/textures/waternormals.jpg");
  normalsMap.wrapS = THREE.MirroredRepeatWrapping;
  normalsMap.wrapT = THREE.MirroredRepeatWrapping;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color("#2C6F8C") },
      map: { value: map },
      normalsMap: { value: normalsMap },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec2 gisUv;
attribute vec2 flowUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec2 vFlowUv;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vFlowUv = gisUv;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 rgb = texture2D(terrianMap, gisUv);
    float heightMeters = decodeTerrariumHeight(rgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform sampler2D map;
uniform sampler2D normalsMap;

uniform vec3 baseColor;
uniform vec3 lightDirection;
uniform float ambientStrength;

varying vec2 vFlowUv;

void main() {
  vec2 uv = fract(vFlowUv * 40.0);
  // vec3 texColor = texture2D(map, uv).rgb;
  vec3 normal = texture2D( normalsMap, uv).rgb;
  vec3 lightDir = normalize(lightDirection);

  if (!gl_FrontFacing) {
    normal *= -1.0;
  }

  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(baseColor * lighting, 1.0);
}
`,
    side: THREE.DoubleSide,
    depthTest: false,
  });

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  return material;
}

function createWaterRiverMaterial(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  const map = textureLoader.load("/textures/istockphoto-118337676-612x612.jpg");

  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.MirroredRepeatWrapping;

  const normalsMap = textureLoader.load("/textures/waternormals.jpg");
  normalsMap.wrapS = THREE.MirroredRepeatWrapping;
  normalsMap.wrapT = THREE.MirroredRepeatWrapping;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color("#3B9FC4") },
      map: { value: map },
      normalsMap: { value: normalsMap },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec2 gisUv;
attribute vec2 flowUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec2 vFlowUv;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vFlowUv = gisUv;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 rgb = texture2D(terrianMap, gisUv);
    float heightMeters = decodeTerrariumHeight(rgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform sampler2D map;
uniform sampler2D normalsMap;

uniform vec3 baseColor;
uniform vec3 lightDirection;
uniform float ambientStrength;

varying vec2 vFlowUv;

void main() {
  vec2 uv = fract(vFlowUv * 40.0);
  // vec3 texColor = texture2D(map, uv).rgb;
  vec3 normal = texture2D( normalsMap, uv).rgb;
  vec3 lightDir = normalize(lightDirection);

  if (!gl_FrontFacing) {
    normal *= -1.0;
  }

  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(baseColor * lighting, 1.0);
}
`,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  return material;
}

function createHighwayPolygonMaterial(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color("#546") },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0.0 },
      lightDirection: {
        value: new THREE.Vector3(0.35, 0.8, 0.25).normalize(),
      },
      ambientStrength: { value: 0.45 },
    },
    vertexShader: `
attribute vec2 gisUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;

varying vec3 vWorldNormal;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vWorldNormal = normalize(normalMatrix * normal);

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 rgb = texture2D(terrianMap, gisUv);
    float heightMeters = decodeTerrariumHeight(rgb);
    displacePosition.y += heightMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`,
    fragmentShader: `
uniform vec3 baseColor;
uniform vec3 lightDirection;
uniform float ambientStrength;

varying vec3 vWorldNormal;

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(lightDirection);

  if (!gl_FrontFacing) {
    normal *= -1.0;
  }

  float diffuse = max(dot(normal, lightDir), 0.0);
  float lighting = ambientStrength + (1.0 - ambientStrength) * diffuse;

  gl_FragColor = vec4(baseColor * lighting, 1.0);
}
`,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  return material;
}

export function buildTileVectorGroup(
  features: GeoJSON.Feature[],
  tile: TileCoords,
  textureLoader: THREE.TextureLoader = null,
): TileVectorGroup {
  const projection = createTileProjection(tile);
  const group = new THREE.Group();
  group.name = `tile-vectors-${tile.z}-${tile.x}-${tile.y}`;

  const markerRadius = Math.max(
    1,
    Math.min(projection.widthMeters, projection.heightMeters) * 0.004,
  );

  const internalTextureLoader = textureLoader ?? new THREE.TextureLoader();

  const disposableMaterials: Array<THREE.Material> = [];

  const materials = {
    water: createWaterMaterial(internalTextureLoader, tile),
    river: createWaterRiverMaterial(internalTextureLoader, tile),
    highway2: createHighwayPolygonMaterial(internalTextureLoader, tile),
    highway: createHighwayMaterial(internalTextureLoader, tile),
    other: new THREE.MeshStandardMaterial({
      color: "#8b9a73",
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
    line: new THREE.LineBasicMaterial({ color: "#f5d28c" }),
    point: new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.7 }),
  };

  disposableMaterials.push(
    materials.water,
    materials.other,
    materials.highway,
    materials.highway2,
    materials.river,
    materials.line,
    materials.point,
  );

  const markerTemplate = new THREE.SphereGeometry(markerRadius, 10, 8);

  const buckets: GeometryBuckets = {
    buildingRoof: [],
    buildingWall: [],
    buildingFace: [],
    water: [],
    river: [],
    other: [],
    highway2: [],
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

  const buildingTexture = getBuildingTexture(internalTextureLoader);

  const roofMaterial = createRoofMaterial("#fff", textureLoader, tile);

  const wallMaterial = createBuildingWallMaterial(
    "#fff",
    buildingTexture,
    textureLoader,
    tile,
  );

  const faceMaterial = createBuildingFaceMaterial("#f00", textureLoader, tile);

  disposableMaterials.push(roofMaterial, wallMaterial, faceMaterial);

  for (const bucket of buildingBuckets.values()) {
    addMergedMesh(group, bucket.roof, roofMaterial);
    addMergedMesh(group, bucket.wall, wallMaterial);
    addMergedMesh(group, bucket.face, faceMaterial);
  }

  addMergedMesh(group, buckets.highway2, materials.highway2);
  addMergedMesh(group, buckets.water, materials.water);
  addMergedMesh(group, buckets.river, materials.river);
  addMergedMesh(group, buckets.other, materials.other);

  const highwaysGroup = new THREE.Group();
  highwaysGroup.name = `tile-highways-${tile.z}-${tile.x}-${tile.y}`;

  addMergedMesh(
    highwaysGroup,
    buckets.highway.map((entry) => entry.geometry),
    materials.highway,
  );

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

  const getHighwayBWMask = (): THREE.CanvasTexture | null => {
    if (buckets.highway.length === 0) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const halfWidth = projection.widthMeters * 0.5;
    const halfHeight = projection.heightMeters * 0.5;
    const metersToPixels = canvas.width / projection.widthMeters;

    for (const entry of buckets.highway) {
      if (entry.centerline.length < 2) {
        continue;
      }

      ctx.lineWidth = Math.max(
        4,
        entry.widthMeters * HIGHWAY_WIDTH_METERS_SCALE * metersToPixels,
      );

      ctx.beginPath();

      for (let index = 0; index < entry.centerline.length; index += 1) {
        const point = entry.centerline[index];
        const u =
          ((point.x + halfWidth) / projection.widthMeters) * canvas.width;
        const v =
          canvas.height -
          ((point.z + halfHeight) / projection.heightMeters) * canvas.height;

        if (index === 0) {
          ctx.moveTo(u, v);
        } else {
          ctx.lineTo(u, v);
        }
      }

      ctx.stroke();
    }

    // const div = document.createElement("div");
    // div.style.cssText = `background: #e019; position: fixed; top: 0; right: 0; width: 512px; height: 512px`;
    // document.body.appendChild(div);
    // canvas.style.cssText = `width: 512px; height: 512px;`;
    // div.appendChild(canvas);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    return texture;
  };

  return {
    group,
    projection,
    objectCount,
    getHighwayBWMask: getHighwayBWMask,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
        }
      });

      for (const material of disposableMaterials) {
        material?.dispose();
      }

      markerTemplate.dispose();
      outlineMaterial.dispose();
    },
  };
}
