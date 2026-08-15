import { lonLatToWorldPixel } from "../calc/mercator.js";
import type { BBox } from "./bbox.js";

export type TileKey = { z: number; x: number; y: number; id: string };

const MAX_BBOX_SPAN_KM = 30;
const KM_PER_LAT_DEGREE = 111.32;

function tileXY(
  lon: number,
  lat: number,
  zoom: number,
): { x: number; y: number } {
  const pixel = lonLatToWorldPixel(lon, lat, zoom);
  const maxIndex = 2 ** zoom - 1;
  return {
    x: Math.min(maxIndex, Math.max(0, Math.floor(pixel.x / 256))),
    y: Math.min(maxIndex, Math.max(0, Math.floor(pixel.y / 256))),
  };
}

function exceedsMaxSpan(bbox: BBox): boolean {
  const centerLat = (bbox.south + bbox.north) / 2;
  const cosLat = Math.max(0.01, Math.cos((centerLat * Math.PI) / 180));

  const latSpanKm = (bbox.north - bbox.south) * KM_PER_LAT_DEGREE;
  const lngSpanKm = (bbox.east - bbox.west) * KM_PER_LAT_DEGREE * cosLat;

  return latSpanKm > MAX_BBOX_SPAN_KM || lngSpanKm > MAX_BBOX_SPAN_KM;
}

/** Lists every z12 tile needed to fully cover the given bbox, or [] if the bbox exceeds 30km. */
export function coverageTilesForBBox(bbox: BBox, zoom = 12): TileKey[] {
  if (exceedsMaxSpan(bbox)) {
    return [];
  }

  const northwest = tileXY(bbox.west, bbox.north, zoom);
  const southeast = tileXY(bbox.east, bbox.south, zoom);

  const minX = Math.min(northwest.x, southeast.x);
  const maxX = Math.max(northwest.x, southeast.x);
  const minY = Math.min(northwest.y, southeast.y);
  const maxY = Math.max(northwest.y, southeast.y);

  const tiles: TileKey[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      tiles.push({ z: zoom, x, y, id: `${zoom}/${x}/${y}` });
    }
  }

  return tiles;
}
