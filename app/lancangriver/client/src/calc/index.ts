import type { TileKey } from "../view/request-scheduler";
import { TILE_SCALE, TILE_SIZE } from "./constants";

export function lonLatToTile(lon: number, lat: number, zoom: number): TileKey {
  const tileCount = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * tileCount);
  const latRad = (lat * Math.PI) / 180;
  const mercatorY =
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  const y = Math.floor(mercatorY * tileCount);

  return {
    z: zoom,
    x: Math.max(0, Math.min(tileCount - 1, x)),
    y: Math.max(0, Math.min(tileCount - 1, y)),
  };
}

export function tileToWorldPosition(tile: TileKey, origin: TileKey) {
  return {
    x: (tile.x - origin.x) * TILE_SIZE * TILE_SCALE,
    z: (tile.y - origin.y) * TILE_SIZE * TILE_SCALE,
  };
}
