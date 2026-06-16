import type { TileKey } from "./request-scheduler";
import type { LODProfile } from "./lod-profile";
import { DEFAULT_LOD_PROFILE } from "./lod-profile";

export type ChildTile = TileKey & {
  offsetX: number;
  offsetY: number;
};

export function chooseSatelliteZoom(
  distanceToTile: number,
  currentZoom?: number,
  profile: LODProfile = DEFAULT_LOD_PROFILE,
): number {
  // Find the distance band containing distanceToTile
  let selectedBand = profile.bands[0];
  for (const band of profile.bands) {
    if (distanceToTile >= band.minDistance && distanceToTile < band.maxDistance) {
      selectedBand = band;
      break;
    }
  }

  // If no current zoom, return the selected band's zoom directly
  if (currentZoom === undefined) {
    return selectedBand.zoom;
  }

  // Apply hysteresis
  if (selectedBand.zoom < currentZoom) {
    // Attempting to go coarser (merge): only change if distance is below merge threshold
    if (distanceToTile < selectedBand.mergeThreshold) {
      return selectedBand.zoom;
    }
    return currentZoom;
  } else if (selectedBand.zoom > currentZoom) {
    // Attempting to go finer (split): only change if distance is above split threshold
    if (distanceToTile > selectedBand.splitThreshold) {
      return selectedBand.zoom;
    }
    return currentZoom;
  }

  // Same zoom level
  return currentZoom;
}

export function enumerateChildTiles(
  baseTile: TileKey,
  targetZoom: number,
): ChildTile[] {
  if (targetZoom <= baseTile.z) {
    return [
      {
        ...baseTile,
        z: baseTile.z,
        offsetX: 0,
        offsetY: 0,
      },
    ];
  }

  const factor = 2 ** (targetZoom - baseTile.z);
  const startX = baseTile.x * factor;
  const startY = baseTile.y * factor;
  const children: ChildTile[] = [];

  for (let y = 0; y < factor; y += 1) {
    for (let x = 0; x < factor; x += 1) {
      children.push({
        z: targetZoom,
        x: startX + x,
        y: startY + y,
        offsetX: x,
        offsetY: y,
      });
    }
  }

  return children;
}
