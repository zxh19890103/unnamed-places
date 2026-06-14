import type { TileKey } from "./request-scheduler";

export type ManifestTileEntry = {
  z: number;
  x: number;
  y: number;
};

export function toTileId(tile: ManifestTileEntry): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function createManifestTileSet(
  entries: ManifestTileEntry[],
): Set<string> {
  return new Set(entries.map(toTileId));
}

export function isTileInManifest(
  tile: TileKey,
  manifestTileSet: Set<string>,
): boolean {
  return manifestTileSet.has(toTileId(tile));
}
