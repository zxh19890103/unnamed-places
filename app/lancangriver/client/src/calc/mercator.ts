import type { SphereTileKey } from "./types";

const MIN_LAT = -85.05112878;
const MAX_LAT = 85.05112878;

function clampLat(lat: number): number {
  return Math.max(MIN_LAT, Math.min(MAX_LAT, lat));
}

function worldPixelSize(zoom: number): number {
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

function worldPixelToLonLat(
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

export function tileBounds4326(
  z: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const northwest = worldPixelToLonLat(x * 256, y * 256, z);
  const southeast = worldPixelToLonLat((x + 1) * 256, (y + 1) * 256, z);
  return [northwest.lon, southeast.lat, southeast.lon, northwest.lat];
}

export function latlngToTilekey2(
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

export function latlngToTilekey(
  lng: number,
  lat: number,
  zoom: number,
): SphereTileKey {
  const latRad = (lat * Math.PI) / 180;
  const lng_ = ((lng + 180) % 360) / 360;
  const n = Math.pow(2, zoom);

  const x = Math.floor(lng_ * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );

  return { x, y, z: zoom };
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

export function zoomToDistance(zoomLevel: number, min = 0, max = 19): number {
  const z = Math.max(min, Math.min(max, zoomLevel));
  return referenceDistanceMeters * 2 ** (max - z);
}

const referenceDistanceMeters = 1_00;
