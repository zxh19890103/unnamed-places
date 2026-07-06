import { latlngToTilekey } from "../../calc/mercator";
import { LatLng, SphereTileKey } from "../../calc/types";

const FOCUS_TILE_ZOOM = 11;
const FOCUS_TILE_EXTENT = {
  x0: -0,
  y0: -0,
  x1: 0,
  y1: 0,
};

export const FOCUS_TILE_WAIT_TIMEOUT_MS = 5_000;

const tileKeyId = (key: SphereTileKey): string => `${key.z}/${key.x}/${key.y}`;

const appendTileIfAbsent = (
  result: SphereTileKey[],
  seen: Set<string>,
  tile: SphereTileKey,
) => {
  const id = tileKeyId(tile);
  if (seen.has(id)) {
    return;
  }

  seen.add(id);
  result.push(tile);
};

const collectTilesInExtent = (
  centerKey: SphereTileKey,
  extent: { x0: number; x1: number; y0: number; y1: number },
) => {
  const n = 2 ** FOCUS_TILE_ZOOM;
  const seen = new Set<string>();
  const result: SphereTileKey[] = [];

  for (let dy = extent.y0; dy <= extent.y1; dy += 1) {
    for (let dx = extent.x0; dx <= extent.x1; dx += 1) {
      const wrappedX = (((centerKey.x + dx) % n) + n) % n;
      const clampedY = Math.max(0, Math.min(n - 1, centerKey.y + dy));

      appendTileIfAbsent(result, seen, {
        z: FOCUS_TILE_ZOOM,
        x: wrappedX,
        y: clampedY,
      });
    }
  }

  return result;
};

export const getFocusZoomLevel = () => FOCUS_TILE_ZOOM;

export const getFocusNeighborTiles = (
  centerLatlng: LatLng,
): {
  centerTile: SphereTileKey;
  coreFocusTiles: SphereTileKey[];
} => {
  const centerTile = latlngToTilekey(
    centerLatlng.lng,
    centerLatlng.lat,
    FOCUS_TILE_ZOOM,
  );

  const coreFocusTiles = collectTilesInExtent(centerTile, FOCUS_TILE_EXTENT);

  return {
    centerTile,
    coreFocusTiles,
  };
};

export const waitForAttachedTiles = async (
  params: {
    targetKeys: SphereTileKey[];
    getAttachedKeys: () => SphereTileKey[];
  },
  timeoutMs = FOCUS_TILE_WAIT_TIMEOUT_MS,
) => {
  const target = new Set(params.targetKeys.map(tileKeyId));
  const start = performance.now();

  await new Promise<void>((resolve, reject) => {
    const check = () => {
      const attachedIds = new Set(params.getAttachedKeys().map(tileKeyId));
      const ready = [...target].every((id) => attachedIds.has(id));

      if (ready) {
        resolve();
        return;
      }

      if (performance.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for focused tiles to attach"));
        return;
      }

      window.requestAnimationFrame(check);
    };

    check();
  });
};
