import { tileBounds4326 } from "../../calc/mercator";
import type { TileCoords } from "../../osm/tiles";

const ZOOM = 12;
const MAX_COORDINATE = 2 ** ZOOM - 1;
const METERS_PER_DEGREE_LATITUDE = 111_320;

export type TileProjection = {
  center: { lat: number; lng: number };
  widthMeters: number;
  heightMeters: number;
  project: (position: GeoJSON.Position) => { x: number; z: number };
};

export function parseTile12Key(value: string): TileCoords | null {
  const match = /^12\/(\d+)\/(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x > MAX_COORDINATE || y > MAX_COORDINATE) {
    return null;
  }

  return { z: ZOOM, x, y };
}

export function createTileProjection(tile: TileCoords): TileProjection {
  const [west, south, east, north] = tileBounds4326(tile.z, tile.x, tile.y);
  const center = {
    lat: (south + north) * 0.5,
    lng: (west + east) * 0.5,
  };
  const metersPerDegreeLongitude =
    Math.cos((center.lat * Math.PI) / 180) * METERS_PER_DEGREE_LATITUDE;

  return {
    center,
    widthMeters: Math.abs(east - west) * metersPerDegreeLongitude,
    heightMeters: Math.abs(north - south) * METERS_PER_DEGREE_LATITUDE,
    project: ([lng, lat]) => ({
      x: (lng - center.lng) * metersPerDegreeLongitude,
      z: (center.lat - lat) * METERS_PER_DEGREE_LATITUDE,
    }),
  };
}
