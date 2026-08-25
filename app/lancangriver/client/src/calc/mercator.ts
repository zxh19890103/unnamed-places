import type { WorldExtent } from './types';

const MIN_LAT = -85.05112878;
const MAX_LAT = 85.05112878;

const tileSize = 256;

function clampLat(lat: number): number {
  return Math.max(MIN_LAT, Math.min(MAX_LAT, lat));
}

function worldPixelSize(zoom: number): number {
  return tileSize * 2 ** zoom;
}

function lonLatToWorldPixel(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const latClamped = clampLat(lat);
  const sinLat = Math.sin((latClamped * Math.PI) / 180);
  const size = worldPixelSize(zoom);
  const x = ((lon + 180) / 360) * size;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  return { x, y };
}

function worldPixelToLonLat(x: number, y: number, zoom: number): { lon: number; lat: number } {
  const size = worldPixelSize(zoom);
  const lon = (x / size) * 360 - 180;
  const mercator = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
  return { lon, lat };
}

export function tileXY(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const pixel = lonLatToWorldPixel(lon, lat, zoom);
  const maxIndex = 2 ** zoom - 1;
  return {
    x: Math.min(maxIndex, Math.max(0, Math.floor(pixel.x / 256))),
    y: Math.min(maxIndex, Math.max(0, Math.floor(pixel.y / 256))),
  };
}

/**
 * west,south,east,north
 */
export function tileBounds4326(z: number, x: number, y: number): [number, number, number, number] {
  const northwest = worldPixelToLonLat(x * tileSize, y * tileSize, z);
  const southeast = worldPixelToLonLat((x + 1) * tileSize, (y + 1) * tileSize, z);
  return [northwest.lon, southeast.lat, southeast.lon, northwest.lat];
}

export function tileExtent(z: number, x: number, y: number): WorldExtent {
  const northwest = worldPixelToLonLat(x * tileSize, y * tileSize, z);
  const southeast = worldPixelToLonLat((x + 1) * tileSize, (y + 1) * tileSize, z);

  return {
    west: northwest.lon,
    east: southeast.lon,
    south: southeast.lat,
    north: northwest.lat,
    latSpan: southeast.lat - northwest.lat,
    lngSpan: northwest.lon - southeast.lon,
  };
}

export function mergeTileExtents(...extents: WorldExtent[]): WorldExtent {
  if (extents.length === 0) {
    throw new Error('mergeTileExtents requires at least one extent');
  }

  const [firstExtent, ...restExtents] = extents;

  const merged = restExtents.reduce<WorldExtent>((merged, extent) => {
    const next = {
      west: Math.min(merged.west, extent.west),
      south: Math.min(merged.south, extent.south),
      east: Math.max(merged.east, extent.east),
      north: Math.max(merged.north, extent.north),
      latSpan: 0,
      lngSpan: 0,
    };
    return next;
  }, firstExtent);

  merged.latSpan = merged.east - merged.west;
  merged.lngSpan = merged.north - merged.south;

  return merged;
}
