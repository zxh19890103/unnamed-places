export type DistanceBand = {
  zoom: number;
  minDistance: number;
  maxDistance: number;
  splitThreshold: number;
  mergeThreshold: number;
};

export type LODProfile = {
  name: string;
  maxSplitDepthPerBase: number;
  maxVisibleChildMeshes: number;
  maxSplitOpsPerFrame: number;
  maxMergeOpsPerFrame: number;
  bands: DistanceBand[];
};

const TILE_SPAN = 256 * 30;

export const CONSERVATIVE_PROFILE: LODProfile = {
  name: "conservative",
  maxSplitDepthPerBase: 2, // up to z13
  maxVisibleChildMeshes: 800,
  maxSplitOpsPerFrame: 10,
  maxMergeOpsPerFrame: 20,
  bands: [
    {
      zoom: 11,
      minDistance: 4 * TILE_SPAN,
      maxDistance: Infinity,
      splitThreshold: 0.95 * 4 * TILE_SPAN,
      mergeThreshold: 1.05 * 4 * TILE_SPAN,
    },
    {
      zoom: 12,
      minDistance: 2 * TILE_SPAN,
      maxDistance: 4 * TILE_SPAN,
      splitThreshold: 0.95 * 2 * TILE_SPAN,
      mergeThreshold: 1.05 * 2 * TILE_SPAN,
    },
    {
      zoom: 13,
      minDistance: TILE_SPAN,
      maxDistance: 2 * TILE_SPAN,
      splitThreshold: 0.95 * TILE_SPAN,
      mergeThreshold: 1.05 * TILE_SPAN,
    },
  ],
};

export const AGGRESSIVE_PROFILE: LODProfile = {
  name: "aggressive",
  maxSplitDepthPerBase: 3, // up to z14
  maxVisibleChildMeshes: 1200,
  maxSplitOpsPerFrame: 20,
  maxMergeOpsPerFrame: 40,
  bands: [
    {
      zoom: 11,
      minDistance: 4 * TILE_SPAN,
      maxDistance: Infinity,
      splitThreshold: 0.95 * 4 * TILE_SPAN,
      mergeThreshold: 1.05 * 4 * TILE_SPAN,
    },
    {
      zoom: 12,
      minDistance: 2 * TILE_SPAN,
      maxDistance: 4 * TILE_SPAN,
      splitThreshold: 0.95 * 2 * TILE_SPAN,
      mergeThreshold: 1.05 * 2 * TILE_SPAN,
    },
    {
      zoom: 13,
      minDistance: TILE_SPAN,
      maxDistance: 2 * TILE_SPAN,
      splitThreshold: 0.95 * TILE_SPAN,
      mergeThreshold: 1.05 * TILE_SPAN,
    },
    {
      zoom: 14,
      minDistance: 0,
      maxDistance: TILE_SPAN,
      splitThreshold: 0.95 * 0.5 * TILE_SPAN,
      mergeThreshold: 1.05 * 0.5 * TILE_SPAN,
    },
  ],
};

export const DEFAULT_LOD_PROFILE = CONSERVATIVE_PROFILE;
