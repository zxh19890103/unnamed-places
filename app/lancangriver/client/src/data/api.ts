import type { TileKey } from "../view/request-scheduler";
import type { ManifestTileEntry } from "../view/manifest-tiles";

export function tileImageUrl(
  baseUrl: string,
  kind: "satellite" | "dem",
  tile: TileKey,
) {
  if (kind === "satellite") {
    return `${baseUrl}/raster/satellite/${tile.z}/${tile.x}/${tile.y}.jpeg`;
  }

  return `${baseUrl}/raster/dem/${tile.z}/${tile.x}/${tile.y}.png`;
}

export async function fetchVector(
  baseUrl: string,
  bbox: [number, number, number, number],
) {
  const query = bbox.join(",");
  const response = await fetch(`${baseUrl}/vector?bbox=${query}`);
  if (!response.ok) {
    throw new Error(`vector request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchDem(baseUrl: string, tile: TileKey) {
  const response = await fetch(
    `${baseUrl}/raster/dem/${tile.z}/${tile.x}/${tile.y}`,
  );
  if (!response.ok) {
    throw new Error(`dem request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchSatellite(baseUrl: string, tile: TileKey) {
  const response = await fetch(
    `${baseUrl}/raster/satellite/${tile.z}/${tile.x}/${tile.y}`,
  );
  if (!response.ok) {
    throw new Error(`satellite request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchTilesManifest(baseUrl: string) {
  const response = await fetch(`${baseUrl}/geo/tiles-manifest`);
  if (!response.ok) {
    throw new Error(`tiles manifest request failed: ${response.status}`);
  }

  return (await response.json()) as ManifestTileEntry[];
}
