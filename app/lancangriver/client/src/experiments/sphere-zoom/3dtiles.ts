import * as THREE from "three";
import { EarthTile, sphereToLatlng, TileMesh } from "./tile";

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
  getZoom: (dist: number) => number;
};

export function create3dTilesViewer({
  camera,
  scene,
  baseDistance = 1_200_000,
  maxZoom = 12,
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
    const distanceToTile = tile.volume.distanceToPoint(eyes);
    const distanceZoom = getZoomLevel(distanceToTile);

    const angleZoomBias = getAngleZoomBiasLevel(tile.runtime.eyeAngle);
    const desiredZoom = Math.max(minZoom, distanceZoom - angleZoomBias);
    return desiredZoom;
  };

  /**
   * @todo has a infinite calls when zoom to the max, near the surface of earth.
   */
  function collectVisibleTiles(
    tile: EarthTile,
    eyes: THREE.Vector3,
    results: EarthTile[],
    desiredZoomGetter: (
      tile: EarthTile,
      eyes: THREE.Vector3,
    ) => number = dynamicDesiredZoomGetter,
  ) {
    if (tile.zoom >= maxZoom) {
      results.push(tile);
      return;
    }

    if (!tile.isInFrustum(cameraFrustum)) {
      console.log("oh, no!");
      return;
    }

    if (tile.isFlatEnough) {
      const tileToEyeDirection = new THREE.Vector3()
        .subVectors(eyes, tile.position)
        .normalize();
      const eyeAngle = tileToEyeDirection.angleTo(tile.normal);

      tile.runtime.eyeAngle = eyeAngle;

      if (eyeAngle > rightAngle) return;
    } else {
      tile.runtime.eyeAngle = 0;
    }

    const zoomDelta = desiredZoomGetter(tile, eyes) - tile.zoom;

    if (zoomDelta <= 0) {
      results.push(tile);
      return;
    }

    const children = tile.subdivide();

    for (const child of children) {
      collectVisibleTiles(child, eyes, results, desiredZoomGetter);
    }
  }

  let rootTile: EarthTile = null;

  let tilesToAdd: EarthTile[] = [];
  let tilesToRemove: EarthTile[] = [];

  let renderedTiles: EarthTile[] = [];

  const cameraFrustum = new THREE.Frustum();
  const cameraProjectionMatrix = new THREE.Matrix4();
  const centerRaycaster = new THREE.Raycaster();
  const centerNdc = new THREE.Vector2(0, 0);
  const earthSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    EARTH_RADIUS,
  );
  const lookAtPoint = new THREE.Vector3();

  function lockRootTile(zoom = 2): EarthTile {
    const eyes = camera.position;
    centerRaycaster.setFromCamera(centerNdc, camera);

    const hasHit =
      centerRaycaster.ray.intersectSphere(earthSphere, lookAtPoint) !== null;
    const anchorPoint = hasHit ? lookAtPoint : eyes;
    const latlng = sphereToLatlng(anchorPoint.x, anchorPoint.y, anchorPoint.z);

    return new EarthTile(latlng, zoom);
  }

  function diffTiles(nextTiles: EarthTile[], currentTiles: EarthTile[]) {
    tilesToAdd = [...nextTiles];
    tilesToRemove = [...currentTiles];
  }

  function renderTiles() {
    for (const tile of tilesToAdd) {
      if (!tile.mesh) {
        new TileMesh(tile, 16);
      }
      scene.add(tile.mesh);
    }
  }

  function disposeTiles() {
    for (const tile of tilesToRemove) {
      if (!tile.mesh) {
        continue;
      }

      scene.remove(tile.mesh);
      tile.mesh.geometry.dispose();
      tile.mesh.material.dispose();
      tile.mesh = null;
    }
  }

  function updateTilesForEyesMoving(eyes: THREE.Vector3) {
    const nextTiles: EarthTile[] = [];

    camera.updateMatrixWorld();
    cameraProjectionMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    cameraFrustum.setFromProjectionMatrix(cameraProjectionMatrix);

    rootTile = lockRootTile();
    collectVisibleTiles(rootTile, eyes, nextTiles);

    diffTiles(nextTiles, renderedTiles);

    renderTiles();
    disposeTiles();

    renderedTiles = nextTiles;
    console.log("tiles:", renderedTiles.length);
  }

  function updateTilesForZoom(zoom: number, eyes: THREE.Vector3) {
    const nextTiles: EarthTile[] = [];

    camera.updateMatrixWorld();
    cameraProjectionMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    cameraFrustum.setFromProjectionMatrix(cameraProjectionMatrix);

    rootTile = lockRootTile(zoom);
    collectVisibleTiles(rootTile, eyes, nextTiles, () => {
      return zoom + 3;
    });

    diffTiles(nextTiles, renderedTiles);

    renderTiles();
    disposeTiles();

    renderedTiles = nextTiles;
  }

  return {
    getZoom: getZoomLevel,
    dispose: () => {
      for (const tile of renderedTiles) {
        if (!tile.mesh) {
          continue;
        }
        scene.remove(tile.mesh);
        tile.mesh.geometry.dispose();
        tile.mesh.material.dispose();
        tile.mesh = null;
      }

      renderedTiles = [];
      tilesToAdd = [];
      tilesToRemove = [];
    },
    update: () => {
      updateTilesForZoom(4, camera.position.clone());
      // updateTilesForEyesMoving(camera.position.clone());
    },
  };
}
