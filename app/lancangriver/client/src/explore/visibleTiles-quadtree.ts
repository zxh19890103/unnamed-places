/**
 * Frustum-based visible tile computation with recursive LOD refinement.
 * Starts from a coarse zoom level and recursively subdivides, testing each tile
 * against the camera frustum to determine visibility.
 */

import * as THREE from "three";
import { SphereTileKey } from "../calc/types";
import { tileBounds4326, enumerateChildTiles } from "../calc/mercator";
import { EARTH_RADIUS, latlngToSphere } from "../calc/sphere";

/**
 * Compute camera frustum from perspective camera.
 * Returns a THREE.Frustum in world space for intersection testing.
 */
export function getFrustumFromCamera(
  camera: THREE.PerspectiveCamera,
): THREE.Frustum {
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  frustum.setFromProjectionMatrix(projScreenMatrix);
  return frustum;
}

/**
 * Test if a tile's bounds intersect the camera frustum.
 * Uses the tile's bounding sphere on the sphere surface for intersection testing.
 */
function isTileVisibleInFrustum(
  key: SphereTileKey,
  frustum: THREE.Frustum,
  radius: number = EARTH_RADIUS,
): boolean {
  const [west, south, east, north] = tileBounds4326(key.z, key.x, key.y);

  // Sample corner points of the tile on the sphere
  const corners = [
    [west, south],
    [west, north],
    [east, south],
    [east, north],
  ];

  const spherePoints = corners.map(([lng, lat]) => {
    const p = latlngToSphere(lat, lng, radius);
    return new THREE.Vector3(p.x, p.y, p.z);
  });

  // Create bounding sphere from corner points
  const center = new THREE.Vector3(
    (spherePoints[0].x +
      spherePoints[1].x +
      spherePoints[2].x +
      spherePoints[3].x) /
      4,
    (spherePoints[0].y +
      spherePoints[1].y +
      spherePoints[2].y +
      spherePoints[3].y) /
      4,
    (spherePoints[0].z +
      spherePoints[1].z +
      spherePoints[2].z +
      spherePoints[3].z) /
      4,
  );

  // Calculate bounding sphere radius as max distance from center to corners
  let maxDist = 0;
  for (const p of spherePoints) {
    const dist = p.distanceTo(center);
    maxDist = Math.max(maxDist, dist);
  }

  // Test against frustum with small buffer
  const sphere = new THREE.Sphere(center, maxDist * 1.1);
  return frustum.intersectsSphere(sphere);
}

/**
 * Cull tiles on the globe backside by checking whether the tile surface faces
 * the camera direction. Tiles with a non-positive facing score are behind the
 * local horizon and not truly visible.
 */
function isTileFacingCamera(
  key: SphereTileKey,
  cameraPosition: THREE.Vector3,
  radius: number = EARTH_RADIUS,
): boolean {
  const [west, south, east, north] = tileBounds4326(key.z, key.x, key.y);
  const centerLng = (west + east) * 0.5;
  const centerLat = (south + north) * 0.5;

  const center = latlngToSphere(centerLat, centerLng, radius);
  const tileCenter = new THREE.Vector3(center.x, center.y, center.z);

  const normal = tileCenter.clone().normalize();
  const toCamera = cameraPosition.clone().sub(tileCenter).normalize();

  // Positive dot means tile normal points toward the camera.
  const facingScore = normal.dot(toCamera);
  return facingScore > 0.001;
}

/**
 * Recursively collect visible tiles by subdividing from current zoom to target zoom.
 * Only recurses into tiles that intersect the frustum.
 */
function recursiveVisibleTiles(
  tile: SphereTileKey,
  targetZoom: number,
  frustum: THREE.Frustum,
  cameraPosition: THREE.Vector3,
  radius: number,
): SphereTileKey[] {
  const visible: SphereTileKey[] = [];

  // Early exit if tile is not visible
  if (!isTileVisibleInFrustum(tile, frustum, radius)) {
    return visible;
  }

  // Frustum-only checks can still include globe backside tiles.
  if (!isTileFacingCamera(tile, cameraPosition, radius)) {
    return visible;
  }

  // If at target zoom, add and stop recursing
  if (tile.z === targetZoom) {
    visible.push(tile);
    return visible;
  }

  // Subdivide: get all children at next zoom level and recurse
  const children = enumerateChildTiles(tile, tile.z + 1);
  for (const child of children) {
    visible.push(
      ...recursiveVisibleTiles(
        child,
        targetZoom,
        frustum,
        cameraPosition,
        radius,
      ),
    );
  }

  return visible;
}

/**
 * Enumerate all tiles at a given zoom level.
 * For coarse zooms (e.g., z=4), this is manageable (256 tiles).
 */
function getTilesAtZoom(zoom: number): SphereTileKey[] {
  const tiles: SphereTileKey[] = [];
  const size = Math.pow(2, zoom);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

/**
 * Compute visible tiles using frustum culling with recursive LOD refinement.
 *
 * @param camera - THREE.PerspectiveCamera for frustum computation
 * @param targetZoom - Final zoom level for visible tiles (e.g., derived from camera distance)
 * @param startZoom - Coarse zoom level to start recursion (default: 4, which is 256 tiles)
 * @param radius - Sphere radius in meters (default: EARTH_RADIUS)
 * @returns Array of visible SphereTileKeys at targetZoom
 *
 * Algorithm:
 * 1. Compute frustum from camera projection-view matrix
 * 2. Enumerate all tiles at startZoom (e.g., 256 tiles at z=4)
 * 3. For each tile:
 *    a. Test bounding sphere against frustum
 *    b. If visible and not at targetZoom, recurse to children
 *    c. Collect all visible tiles at targetZoom
 * 4. Return collected tiles
 *
 * Efficiency:
 * - Only tests tiles that might be visible (frustum-culled)
 * - Avoids testing all tiles at target zoom (e.g., 16M tiles at z=20)
 * - Typical result: 100-500 visible tiles at target zoom
 */
export function getVisibleTilesInFrustum(
  camera: THREE.PerspectiveCamera,
  targetZoom: number,
  startZoom: number = 4,
  radius: number = EARTH_RADIUS,
): SphereTileKey[] {
  const frustum = getFrustumFromCamera(camera);
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());

  // Start with all tiles at coarse zoom
  const startTiles = getTilesAtZoom(startZoom);
  const visible: SphereTileKey[] = [];

  // Recursively process each start tile
  for (const tile of startTiles) {
    visible.push(
      ...recursiveVisibleTiles(
        tile,
        targetZoom,
        frustum,
        cameraPosition,
        radius,
      ),
    );
  }

  return visible;
}
