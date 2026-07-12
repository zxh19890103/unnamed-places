import * as THREE from "three";
import {
  EarthTile,
  EarthTilesManager,
  sphereToLatlng,
  TileMesh,
  TileOutline,
} from "./tile";

export const EARTH_RADIUS = 6_371_008.8;

type Create3dTilesViewerInputs = {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  baseDistance?: number;
  maxZoom?: number;
};

export type Create3dTilesViewerHandle = {
  dispose: () => void;
  update: () => void;
  enableUpdate: (enabled: boolean) => void;
  getZoom: (dist: number) => number;
  getTileCount: () => number;
};

export function create3dTilesViewer({
  camera,
  scene,
  baseDistance = 46188_000,
  maxZoom = 21,
}: Create3dTilesViewerInputs): Create3dTilesViewerHandle {
  const minZoom = 0;
  const refineBiasStartAngle = (60 * Math.PI) / 180;
  const maxRefineViewAngle = (85 * Math.PI) / 180;
  const maxAngleZoomBiasLevels = 2;
  const rightAngle = Math.PI / 2;

  function getZoomLevel(dist: number) {
    if (dist <= 0) return maxZoom;
    const zoomLevel = Math.floor(Math.log2(baseDistance / dist));
    return Math.max(minZoom, Math.min(zoomLevel, maxZoom));
  }

  function getAngleZoomBiasLevel(eyeAngle: number) {
    if (eyeAngle <= refineBiasStartAngle) {
      return 0;
    }

    if (eyeAngle >= maxRefineViewAngle) {
      return maxAngleZoomBiasLevels;
    }

    const t =
      (eyeAngle - refineBiasStartAngle) /
      (maxRefineViewAngle - refineBiasStartAngle);

    return Math.floor(t * maxAngleZoomBiasLevels);
  }

  const dynamicDesiredZoomGetter = (tile: EarthTile, eyes: THREE.Vector3) => {
    const distanceToTile = tile.distanceTo(eyes);
    const distanceZoom = getZoomLevel(distanceToTile);
    const angleZoomBias = getAngleZoomBiasLevel(tile.runtime.eyeAngle);
    const desiredZoom = Math.max(minZoom, distanceZoom - angleZoomBias);
    return desiredZoom;
  };

  /**
   * @todo has a infinite calls when zoom to the max, near the surface of earth.
   */
  function traverseVisibleTiles(
    tile: EarthTile,
    eyes: THREE.Vector3,
    results: EarthTile[],
    desiredZoomGetter: (
      tile: EarthTile,
      eyes: THREE.Vector3,
    ) => number = dynamicDesiredZoomGetter,
  ) {
    if (tile.zoom > 3 && !tile.isInFrustum(cameraFrustum)) {
      return;
    }

    if (tile.zoom >= maxZoom) {
      results.push(tile);
      return;
    }

    const zoomDelta = desiredZoomGetter(tile, eyes) - tile.zoom;

    if (zoomDelta <= 0) {
      results.push(tile);
      return;
    }

    const children = tilesManager.subdivide(tile);

    for (const child of children) {
      traverseVisibleTiles(child, eyes, results, desiredZoomGetter);
    }
  }

  let rootTile: EarthTile = null;
  const tilesManager = new EarthTilesManager();

  const cameraFrustum = new THREE.Frustum();
  const cameraProjectionMatrix = new THREE.Matrix4();
  const centerRaycaster = new THREE.Raycaster();
  const centerNdc = new THREE.Vector2(0, 0);
  const earthSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    EARTH_RADIUS,
  );
  const lookAtPoint = new THREE.Vector3();

  function lockLookingAtRootTile(zoom = 0): EarthTile {
    const eyes = camera.position;
    centerRaycaster.setFromCamera(centerNdc, camera);

    const hasHit =
      centerRaycaster.ray.intersectSphere(earthSphere, lookAtPoint) !== null;
    const anchorPoint = hasHit ? lookAtPoint : eyes;
    const latlng = sphereToLatlng(anchorPoint.x, anchorPoint.y, anchorPoint.z);

    return tilesManager.create(latlng, zoom);
  }

  function renderTiles() {
    for (const tile of tilesManager.tilesToAdd) {
      if (!tile.mesh) {
        tile.mesh = new TileMesh(tile, 16);
      }
      scene.add(tile.mesh);
    }
  }

  function disposeTiles() {
    for (const tile of tilesManager.tilesToRemove) {
      if (tile.outline) {
        scene.remove(tile.outline);
        tile.outline.dispose();
        tile.outline = null;
      }

      if (tile.mesh) {
        scene.remove(tile.mesh);
        tile.mesh.dispose();
        tile.mesh = null;
      }
    }
  }

  function getGlobalTilesAtZoom(zoom: number): EarthTile[] {
    const safeZoom = THREE.MathUtils.clamp(Math.floor(zoom), 0, 2);
    const n = 2 ** safeZoom;
    const tiles: EarthTile[] = [];

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        tiles.push(tilesManager.createZxy(safeZoom, x, y));
      }
    }

    return tiles;
  }

  function updateTilesForEyesMoving(eyes: THREE.Vector3) {
    const nextTiles: EarthTile[] = [];

    camera.updateMatrixWorld();

    cameraProjectionMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );

    cameraFrustum.setFromProjectionMatrix(cameraProjectionMatrix);

    const rootTiles = getGlobalTilesAtZoom(1);

    for (const tile of rootTiles) {
      traverseVisibleTiles(tile, eyes, nextTiles, betterTileTargetZoomGetter);
    }

    tilesManager.replace(nextTiles);

    renderTiles();
    disposeTiles();
  }

  const betterTileTargetZoomGetter = (tile, eyes) => {
    const closestDist = tile.distanceTo(eyes);
    const zoom = getZoomLevel(closestDist);
    return zoom;
  };

  function updateTilesForZoom(
    zoom0: number,
    zoom1: number,
    eyes: THREE.Vector3,
  ) {
    const nextTiles: EarthTile[] = [];

    camera.updateMatrixWorld();

    cameraProjectionMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );

    cameraFrustum.setFromProjectionMatrix(cameraProjectionMatrix);

    rootTile = lockLookingAtRootTile(zoom0);

    traverseVisibleTiles(rootTile, eyes, nextTiles, betterTileTargetZoomGetter);

    tilesManager.replace(nextTiles);

    renderTiles();
    disposeTiles();
  }

  let updateEnabled = true;
  let frustumSnapshot: THREE.CameraHelper | null = null;

  function removeFrustumSnapshot() {
    if (!frustumSnapshot) {
      return;
    }

    scene.remove(frustumSnapshot);
    frustumSnapshot.geometry.dispose();

    const snapshotMaterial = frustumSnapshot.material;
    if (Array.isArray(snapshotMaterial)) {
      for (const material of snapshotMaterial) {
        material.dispose();
      }
    } else {
      snapshotMaterial.dispose();
    }

    frustumSnapshot = null;
  }

  function createFrustumSnapshot() {
    removeFrustumSnapshot();

    const snapshotCamera = camera.clone();
    snapshotCamera.position.copy(camera.position);
    snapshotCamera.quaternion.copy(camera.quaternion);
    snapshotCamera.scale.copy(camera.scale);
    snapshotCamera.up.copy(camera.up);
    snapshotCamera.near = camera.near;
    snapshotCamera.far = camera.far;
    snapshotCamera.aspect = camera.aspect;
    snapshotCamera.fov = camera.fov;
    snapshotCamera.updateProjectionMatrix();
    snapshotCamera.updateMatrixWorld(true);

    frustumSnapshot = new THREE.CameraHelper(snapshotCamera);
    frustumSnapshot.update();
    scene.add(frustumSnapshot);
  }

  return {
    getZoom: getZoomLevel,
    getTileCount: () => tilesManager.tiles.length,
    dispose: () => {
      for (const tile of tilesManager.tiles) {
        if (tile.outline) {
          scene.remove(tile.outline);
          tile.outline.dispose();
          tile.outline = null;
        }

        if (tile.mesh) {
          scene.remove(tile.mesh);
          tile.mesh.dispose();
          tile.mesh = null;
        }
      }

      tilesManager.tiles = [];
      tilesManager.tilesToAdd = [];
      tilesManager.tilesToRemove = [];

      removeFrustumSnapshot();
    },
    enableUpdate: (enabled: boolean) => {
      updateEnabled = enabled;

      if (enabled) {
        removeFrustumSnapshot();
      } else {
        createFrustumSnapshot();
      }
    },
    update: () => {
      if (updateEnabled) {
        // updateTilesForZoom(3, 6, camera.position.clone());
        updateTilesForEyesMoving(camera.position.clone());
      }
    },
  };
}
