import * as THREE from "three";
import { TileProjection } from "../tile";
import * as polygonUtils from "../_polygon";
import { uniformSettings } from "../_cfg";
import {
  BuildingPalette,
  BuildingVariant,
  BuildingVariantBucket,
} from "./_types";

const METERS_PER_LEVEL = 3.2;
const RANDOM_HEIGHT_MIN = 6;
const RANDOM_HEIGHT_MAX = 45;

const MIN_GUESSED_BUILDING_HEIGHT_METERS = 8;
const MAX_GUESSED_BUILDING_HEIGHT_METERS = 120;
const FOOTPRINT_HEIGHT_SCALE = 1.8;

const BUILDING_TEXTURE_REPEAT_METERS = 10;

export const BUILDING_TEXTURE_GRID = new THREE.Vector2(3, 2);
export const BUILDING_ATLAS_UV_INSET = new THREE.Vector2(0.1, 0.1);
export const BUILDING_WALL_TEXTURE_UV_SCALE = 2.0;
export const BUILDING_FACE_TEXTURE_GRID = new THREE.Vector2(6, 4);

const BUILDING_FACE_MIN_HORIZONTAL_LENGTH_METERS = 12;

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

export function getBuildingTexture(
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

  const texture = textureLoader.load(
    "/textures/SPR-hide-flaws-with-stipple-texture.jpg",
  );
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  // texture.colorSpace = THREE.SRGBColorSpace;
  cachedBuildingTexture = texture;
  return cachedBuildingTexture;
}

export function applyBuildingRepeatUv(
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
  centroid: [number, number],
): THREE.Float32BufferAttribute {
  const itemSize = 4;

  const metadata = new Float32Array(positionAttr.count * itemSize);

  const offsetX = Math.floor(Math.random() * textureGrid.x);
  const offsetY = Math.floor(Math.random() * textureGrid.y);

  for (let index = 0; index < positionAttr.count; index += 1) {
    const base = index * itemSize;

    metadata[base] = offsetX;
    metadata[base + 1] = offsetY;

    const rawU = THREE.MathUtils.clamp(
      centroid[0] / projectiton.widthMeters + 0.5,
      0,
      1,
    );
    const rawV = THREE.MathUtils.clamp(
      -centroid[1] / projectiton.heightMeters + 0.5,
      0,
      1,
    );
    const gridSize = uniformSettings.GROUND_UV_GRID_SIZE;

    metadata[base + 2] = Math.round(rawU * gridSize) / gridSize;
    metadata[base + 3] = Math.round(rawV * gridSize) / gridSize;
  }

  return new THREE.Float32BufferAttribute(metadata, itemSize);
}

export function ensureMetadataAttribute(
  geometry: THREE.BufferGeometry,
  projection: TileProjection,
  textureGrid: THREE.Vector2,
  centroid: [number, number],
): void {
  const position = geometry.getAttribute("position");

  if (!position) {
    return;
  }

  geometry.setAttribute(
    "metadata",
    createBuildingMetadataAttribute(
      position,
      projection,
      textureGrid,
      centroid,
    ),
  );
}

type BuildingFaceType = "roof" | "wall" | "face";

type BuildingFaceSplitSegments = {
  /**
   * @deprecated wll removed.
   */
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

export function splitBuildingGeometryByFaceType(
  geometry: THREE.BufferGeometry,
): Omit<BuildingFaceSplitSegments, "roof"> {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");

  if (!position || !normal) {
    source.dispose();
    return { wall: null, face: null };
  }

  const normal0 = new THREE.Vector3();
  const normal1 = new THREE.Vector3();
  const normal2 = new THREE.Vector3();

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();

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

    if (faceType === "wall") {
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
    } else {
      //
    }
  }

  source.dispose();

  const defaultGeometryFactory = (positions: number[]) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    return geometry;
  };

  const createGeometry = (
    positions: number[],
    normals: number[],
    uvs: number[],
  ): THREE.BufferGeometry | null => {
    if (positions.length === 0) {
      return null;
    }

    const geometry = defaultGeometryFactory(positions);

    if (normals.length === positions.length) {
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(normals, 3),
      );
    } else {
      geometry.computeVertexNormals();
    }

    if (uvs.length > 0) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    }

    return geometry;
  };

  return {
    wall: createGeometry(wallPositions, wallNormals, wallUvs),
    face: createGeometry(facePositions, faceNormals, faceUvs),
  };
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

export function getBuildingHeight(feature: GeoJSON.Feature): number {
  const height = polygonUtils.readFeatureNumber(feature, "height");
  if (height !== null && height > 0) {
    return height;
  }

  const minHeight = Math.max(
    polygonUtils.readFeatureNumber(feature, "min_height") ?? 0,
    0,
  );
  const levels = polygonUtils.readFeatureNumber(feature, "building:levels");
  if (levels !== null && levels > 0) {
    return minHeight + levels * METERS_PER_LEVEL;
  }

  const roofLevels = Math.max(
    polygonUtils.readFeatureNumber(feature, "roof:levels") ?? 0,
    0,
  );
  const guessedHeightCap = guessedHeightCapFromFootprint(
    polygonUtils.featureFootprintAreaSquareMeters(feature),
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
    polygonUtils.readFeatureString(feature, "building") ??
    polygonUtils.readFeatureString(feature, "building:use") ??
    polygonUtils.readFeatureString(feature, "amenity") ??
    "";

  const normalized = rawType.toLowerCase().trim();
  if (!normalized) {
    return "";
  }

  return normalized.split(";")[0]?.trim() ?? normalized;
}

export function buildingVariantForFeature(
  feature: GeoJSON.Feature,
): BuildingVariant {
  const type = readNormalizedBuildingType(feature);
  const palette = BUILDING_TYPE_COLOR_HINTS[type] ?? DEFAULT_BUILDING_PALETTE;
  return {
    key: `${palette.roof}|${palette.wall}`,
    palette,
  };
}

export function getOrCreateBuildingBucket(
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
    polygonUtils.readFeatureString(feature, "id") ??
    polygonUtils.readFeatureString(feature, "@id") ??
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
