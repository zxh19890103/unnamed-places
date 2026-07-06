import { Vector3, PerspectiveCamera } from "three";
import { SphereTileKey } from "../calc/types";
import {
  disatanceToZoom,
  tileBounds4326,
  zoomToDistance,
} from "../calc/mercator";
import { EARTH_RADIUS, latlngToSphere } from "../calc/sphere";

interface Tile extends SphereTileKey {
  /**
   * center position
   */
  sphere: Vector3;
  leaf: boolean;
}

function getTileCenterSphere(tile: SphereTileKey): Vector3 {
  const [west, south, east, north] = tileBounds4326(tile.z, tile.x, tile.y);
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const center = latlngToSphere(centerLat, centerLng, EARTH_RADIUS);
  return new Vector3(center.x, center.y, center.z);
}

function distanceFromTileToCamera(
  tile: SphereTileKey,
  camera: PerspectiveCamera,
) {
  const cameraPosition = camera.getWorldPosition(new Vector3());
  const tileCenter = getTileCenterSphere(tile);
  return cameraPosition.distanceTo(tileCenter);
}

function isTileTooCoarse(tile: Tile, camera: PerspectiveCamera) {
  const distance = distanceFromTileToCamera(tile, camera);
  const dis = zoomToDistance(tile.z);
  return distance < dis;
}

export function splitTileInTo4(tile: Tile) {
  // split into 4 subtiles.
  const children: Tile[] = [];
  const startX = tile.x * 2;
  const startY = tile.y * 2;

  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const child = {
        z: tile.z + 1,
        x: startX + x,
        y: startY + y,
        leaf: true,
        sphere: null,
      };

      child.sphere = getTileCenterSphere(child);
      children.push(child);
    }
  }

  return children;
}

/**
 */
function splitTilesToFit(
  root: Tile[],
  targetZoom: number,
  camera: PerspectiveCamera,
) {
  const tiles = [...root];

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];

    if (tile.z >= targetZoom) {
      continue;
    }

    if (isTileTooCoarse(tile, camera)) {
      tile.leaf = false;
      tiles.push(...splitTileInTo4(tile));
    }
  }

  return tiles.filter((tile) => tile.leaf);
}

export function tile01(keys: SphereTileKey[], camera: PerspectiveCamera) {
  const tiles: Tile[] = keys.map((k) => {
    return { ...k, leaf: true, sphere: getTileCenterSphere(k) };
  });
  const cameraDistance =
    camera.getWorldPosition(new Vector3()).length() - EARTH_RADIUS;
  const targetZoom = disatanceToZoom(cameraDistance);
  return splitTilesToFit(tiles, targetZoom, camera);
}
