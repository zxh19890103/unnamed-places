import type { TileKey } from "./request-scheduler";

const MIN_LAT = -85.05112878;
const MAX_LAT = 85.05112878;

function clampLat(lat: number): number {
  return Math.max(MIN_LAT, Math.min(MAX_LAT, lat));
}

export function worldPixelSize(zoom: number): number {
  return 256 * 2 ** zoom;
}

export function lonLatToWorldPixel(
  lon: number,
  lat: number,
  zoom: number,
): { x: number; y: number } {
  const latClamped = clampLat(lat);
  const sinLat = Math.sin((latClamped * Math.PI) / 180);
  const size = worldPixelSize(zoom);
  const x = ((lon + 180) / 360) * size;
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  return { x, y };
}

export function worldPixelToLonLat(
  x: number,
  y: number,
  zoom: number,
): { lon: number; lat: number } {
  const size = worldPixelSize(zoom);
  const lon = (x / size) * 360 - 180;
  const mercator = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
  return { lon, lat };
}

export function tileCenterToWorldPixel(tile: TileKey): {
  x: number;
  y: number;
} {
  return {
    x: (tile.x + 0.5) * 256,
    y: (tile.y + 0.5) * 256,
  };
}

export function tileCenterToLonLat(tile: TileKey): {
  lon: number;
  lat: number;
} {
  const center = tileCenterToWorldPixel(tile);
  return worldPixelToLonLat(center.x, center.y, tile.z);
}

export function tileBounds4326(
  z: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const northwest = worldPixelToLonLat(x * 256, y * 256, z);
  const southeast = worldPixelToLonLat((x + 1) * 256, (y + 1) * 256, z);
  return [northwest.lon, southeast.lat, southeast.lon, northwest.lat];
}
