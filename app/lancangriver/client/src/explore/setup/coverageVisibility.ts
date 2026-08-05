import * as THREE from "three";

import {
  EARTH_RADIUS,
  sphereToLatlng,
} from "../../experiments/sphere-zoom/core.js";
import { latlngToStandardTileZxy } from "../../experiments/sphere-zoom/tile.js";

type TileKeyLike = {
  z: number;
  x: number;
  y: number;
};

export type VisibleCoverageTile = {
  key: string;
  z: number;
  x: number;
  y: number;
};

type CollectVisibleCoverageTilesOptions = {
  camera: THREE.PerspectiveCamera;
  frustumTiles: TileKeyLike[];
  viewportWidth: number;
  viewportHeight: number;
  targetZoom?: number;
  paddingPx?: number;
  sampleStepPx?: number;
};

const DEFAULT_TARGET_ZOOM = 12;
const DEFAULT_PADDING_PX = 40;
const DEFAULT_SAMPLE_STEP_PX = 56;

function keyOf(tile: TileKeyLike): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

function tileOverlaps(a: TileKeyLike, b: TileKeyLike): boolean {
  if (a.z === b.z) {
    return a.x === b.x && a.y === b.y;
  }

  if (a.z < b.z) {
    const delta = b.z - a.z;
    return b.x >> delta === a.x && b.y >> delta === a.y;
  }

  const delta = a.z - b.z;
  return a.x >> delta === b.x && a.y >> delta === b.y;
}

export function collectVisibleCoverageTiles({
  camera,
  frustumTiles,
  viewportWidth,
  viewportHeight,
  targetZoom = DEFAULT_TARGET_ZOOM,
  paddingPx = DEFAULT_PADDING_PX,
  sampleStepPx = DEFAULT_SAMPLE_STEP_PX,
}: CollectVisibleCoverageTilesOptions): VisibleCoverageTile[] {
  const safeWidth = Math.max(1, Math.floor(viewportWidth));
  const safeHeight = Math.max(1, Math.floor(viewportHeight));
  const safePadding = Math.max(0, Math.floor(paddingPx));
  const safeStep = Math.max(8, Math.floor(sampleStepPx));

  if (frustumTiles.length === 0) {
    return [];
  }

  const frustumCandidates = frustumTiles.map((tile) => ({
    z: tile.z,
    x: tile.x,
    y: tile.y,
  }));

  const raycaster = new THREE.Raycaster();
  const earth = new THREE.Sphere(new THREE.Vector3(0, 0, 0), EARTH_RADIUS);
  const hitPoint = new THREE.Vector3();

  const sampled = new Map<string, VisibleCoverageTile>();

  const sampleX: number[] = [];
  const sampleY: number[] = [];

  for (let x = -safePadding; x <= safeWidth + safePadding; x += safeStep) {
    sampleX.push(Math.min(safeWidth + safePadding, x));
  }
  if (sampleX[sampleX.length - 1] !== safeWidth + safePadding) {
    sampleX.push(safeWidth + safePadding);
  }

  for (let y = -safePadding; y <= safeHeight + safePadding; y += safeStep) {
    sampleY.push(Math.min(safeHeight + safePadding, y));
  }
  if (sampleY[sampleY.length - 1] !== safeHeight + safePadding) {
    sampleY.push(safeHeight + safePadding);
  }

  for (const screenY of sampleY) {
    const ndcY = 1 - (screenY / safeHeight) * 2;

    for (const screenX of sampleX) {
      const ndcX = (screenX / safeWidth) * 2 - 1;

      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      if (!raycaster.ray.intersectSphere(earth, hitPoint)) {
        continue;
      }

      const latlng = sphereToLatlng(hitPoint.x, hitPoint.y, hitPoint.z);
      const [z, x, y] = latlngToStandardTileZxy(latlng, targetZoom);
      const candidate = { z, x, y };

      const inFrustumSet = frustumCandidates.some((frustumTile) =>
        tileOverlaps(frustumTile, candidate),
      );

      if (!inFrustumSet) {
        continue;
      }

      const key = keyOf(candidate);
      if (!sampled.has(key)) {
        sampled.set(key, { key, z, x, y });
      }
    }
  }

  return [...sampled.values()].sort((a, b) => {
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });
}

export const coverageVisibilityInternals = {
  tileOverlaps,
};
