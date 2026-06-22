import { lonLatToWorldPixel, tileBounds4326 } from "../calc/mercator";
import { SphereTileKey } from "../calc/types";

export type ViewState = {
  centerLon: number;
  centerLat: number;
  zoom: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  haloTiles?: number;
};

export type TileKey = SphereTileKey;

export type RequestPlan = {
  vectorBbox: [number, number, number, number];
  rasterTiles: TileKey[];
};

function tileIndexRange(
  minPx: number,
  maxPx: number,
  limit: number,
): [number, number] {
  const min = Math.max(0, Math.min(limit - 1, Math.floor(minPx / 256)));
  const max = Math.max(0, Math.min(limit - 1, Math.floor(maxPx / 256)));
  return [Math.min(min, max), Math.max(min, max)];
}

function expandRange(
  min: number,
  max: number,
  haloTiles: number,
  limit: number,
): [number, number] {
  const safeHaloTiles = Math.max(0, Math.floor(haloTiles));
  const expandedMin = Math.max(0, min - safeHaloTiles);
  const expandedMax = Math.min(limit - 1, max + safeHaloTiles);
  return [expandedMin, expandedMax];
}

export function computeRequestPlan(view: ViewState): RequestPlan {
  const z = Math.max(0, Math.floor(view.zoom));
  const center = lonLatToWorldPixel(view.centerLon, view.centerLat, z);
  const haloTiles = Math.max(0, Math.floor(view.haloTiles ?? 1));

  const minPxX = center.x - view.viewportWidthPx / 2;
  const maxPxX = center.x + view.viewportWidthPx / 2;
  const minPxY = center.y - view.viewportHeightPx / 2;
  const maxPxY = center.y + view.viewportHeightPx / 2;

  const tileCount = 2 ** z;
  const [visibleMinX, visibleMaxX] = tileIndexRange(minPxX, maxPxX, tileCount);
  const [visibleMinY, visibleMaxY] = tileIndexRange(minPxY, maxPxY, tileCount);
  const [minX, maxX] = expandRange(
    visibleMinX,
    visibleMaxX,
    haloTiles,
    tileCount,
  );
  const [minY, maxY] = expandRange(
    visibleMinY,
    visibleMaxY,
    haloTiles,
    tileCount,
  );

  const rasterTiles: TileKey[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      rasterTiles.push({ z, x, y });
    }
  }

  const firstBounds = tileBounds4326(z, minX, minY);
  const lastBounds = tileBounds4326(z, maxX, maxY);
  const vectorBbox: [number, number, number, number] = [
    firstBounds[0],
    lastBounds[1],
    lastBounds[2],
    firstBounds[3],
  ];

  return { vectorBbox, rasterTiles };
}
