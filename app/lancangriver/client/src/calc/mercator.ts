import type { SphereTileKey } from "./types";

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

export function tileCenterToWorldPixel(tile: SphereTileKey): {
  x: number;
  y: number;
} {
  return {
    x: (tile.x + 0.5) * 256,
    y: (tile.y + 0.5) * 256,
  };
}

export function tileCenterToLonLat(tile: SphereTileKey): {
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

export function latlngToTilekey(
  lon: number,
  lat: number,
  zoom: number,
): SphereTileKey {
  const tileCount = 2 ** zoom;
  const { x, y } = lonLatToWorldPixel(lon, lat, zoom);

  const tileX = Math.floor(x / 256);
  const tileY = Math.floor(y / 256);

  return {
    z: zoom,
    x: Math.max(0, Math.min(tileCount - 1, tileX)),
    y: Math.max(0, Math.min(tileCount - 1, tileY)),
  };
}

export function enumerateChildTiles(
  baseTile: SphereTileKey,
  targetZoom: number,
): SphereTileKey[] {
  if (targetZoom <= baseTile.z) {
    return [baseTile];
  }

  const factor = 2 ** (targetZoom - baseTile.z);
  const startX = baseTile.x * factor;
  const startY = baseTile.y * factor;
  const children: SphereTileKey[] = [];

  for (let y = 0; y < factor; y += 1) {
    for (let x = 0; x < factor; x += 1) {
      children.push({
        z: targetZoom,
        x: startX + x,
        y: startY + y,
      });
    }
  }

  return children;
}

export function getZoomLvFromDistance(distance: number, min = 0, max = 19) {
  if (!Number.isFinite(distance) || distance <= 0) {
    return min;
  }

  const rawZoom = max - Math.log2(distance / referenceDistanceMeters);
  const zoom = Math.floor(rawZoom);

  return Math.max(min, Math.min(max, zoom));
}

const referenceDistanceMeters = 1_00;
