import { BASE_URL, EARTH_RADIUS } from '@/calc/constants';

export function getPhotoUrl(kind: 'thumb' | 'original', filePath: string): string {
  return `${BASE_URL}/photos/${kind}/${encodeURIComponent(filePath)}`;
}

export function latLngToTileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function tileXYToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = 2 ** zoom;
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lat: (latRad * 180) / Math.PI, lng };
}

export function latLngToTileUv(
  lat: number,
  lng: number,
  zoom: number,
  tileX: number,
  tileY: number,
): { u: number; v: number } {
  const tileXY = latLngToTileXY(lat, lng, zoom);
  return { u: tileXY.x - tileX, v: 1 - (tileXY.y - tileY) };
}

export function tileMetersAtLatitude(lat: number, zoom: number): number {
  const circumference = 2 * Math.PI * EARTH_RADIUS * Math.cos((lat * Math.PI) / 180);
  return circumference / 2 ** zoom;
}

export function latLngToMetersOffset(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
): { x: number; z: number } {
  const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS;
  const metersPerDegLng = metersPerDegLat * Math.cos((centerLat * Math.PI) / 180);
  return {
    x: (lng - centerLng) * metersPerDegLng,
    z: -(lat - centerLat) * metersPerDegLat,
  };
}

export async function fetchTileAltitude(z: number, x: number, y: number): Promise<TileAltitude> {
  const response = await fetch(`${BASE_URL}/raster/dem/${z}/${x}/${y}/altitude`);
  if (!response.ok) {
    throw new Error(`DEM altitude ${z}/${x}/${y} failed: ${response.status}`);
  }
  const data = (await response.json()) as {
    ok: boolean;
    min: number;
    max: number;
    avg: number;
  };
  return { min: data.min, max: data.max, avg: data.avg };
}

type TileAltitude = {
  min: number;
  max: number;
  avg: number;
};
