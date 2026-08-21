import * as THREE from "three";
import { EarthTile, EarthTilesManager } from "./tile.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  EARTH_RADIUS,
  LatLng,
  latlngToSphere,
  sphereToLatlng,
} from "./core.js";
import { useEffect, useReducer, useState } from "react";
import { getLocalBasisAtPoint } from "@/calc/sphere.js";

type Create3dTilesViewerInputs = {
  camera: THREE.PerspectiveCamera;
  /**
   * beyond which, zoom is 0.
   * @default 46188_000
   */
  baseDistance?: number;
  /**
   * @default 21
   */
  maxZoom?: number;
  /**
   * @default 8
   */
  flatMinZoom?: number;
  onDispose?: () => void;
  onTileRender?: (tile: EarthTile) => void;
  onTileDestory?: (tile: EarthTile) => void;
};

export type Create3dTilesViewer = {
  state: ViewerState;
  dispose: () => void;
  update: () => void;
  getVisibleTiles: (eyes: THREE.Vector3) => EarthTile[];
  setElevationRange: (minMeters: number, maxMeters: number) => void;
  getElevationRange: () => { min: number; max: number };
  zoomToDistance: (zoom: number) => number;
  distanceToZoom: (dist: number) => number;
  enableUpdate: (enabled: boolean) => void;
  getZoom: (dist: number) => number;
  getLookAtZoom: () => number;
  getTileCount: () => number;
  lookAtLatlng: (latlng?: LatLng) => void;
  lookAtOrigin: () => void;
  useOrbitControls: (controls: OrbitControls) => void;
};

export function create3dTilesViewer({
  camera,
  baseDistance = 46188_000,
  maxZoom = 21,
  ...inputs
}: Create3dTilesViewerInputs): Create3dTilesViewer {
  const minZoom = 0;
  const safeBaseDistance =
    Number.isFinite(baseDistance) && baseDistance > 0 ? baseDistance : 1;

  function clampZoom(zoom: number) {
    return THREE.MathUtils.clamp(Math.floor(zoom), minZoom, maxZoom);
  }

  function getZoomLevel(dist: number) {
    if (!Number.isFinite(dist)) return minZoom;
    if (dist <= 0) return maxZoom;

    const zoomLevel = Math.floor(Math.log2(safeBaseDistance / dist));
    if (!Number.isFinite(zoomLevel)) {
      return minZoom;
    }

    return clampZoom(zoomLevel);
  }

  function traverseVisibleTiles(
    tile: EarthTile,
    eyes: THREE.Vector3,
    results: EarthTile[],
  ) {
    if (tile.zoom > 3 && !tile.isInFrustum(cameraFrustum)) {
      return;
    }

    if (tile.zoom >= maxZoom) {
      results.push(tile);
      return;
    }

    const closestDist = tile.distanceTo(eyes);
    const targetZoom = getZoomLevel(closestDist);
    const zoomDelta = targetZoom - tile.zoom;

    if (zoomDelta <= 0) {
      results.push(tile);
      return;
    }

    const children = tilesManager.subdivide(tile);

    for (const child of children) {
      traverseVisibleTiles(child, eyes, results);
    }
  }

  const tilesManager = new EarthTilesManager();

  const cameraFrustum = new THREE.Frustum();
  const cameraProjectionMatrix = new THREE.Matrix4();

  function renderTiles() {
    for (const tile of tilesManager.tilesToAdd) {
      if (inputs.onTileRender) {
        inputs.onTileRender(tile);
      }
    }
  }

  function disposeTiles() {
    for (const tile of tilesManager.tilesToRemove) {
      if (inputs.onTileDestory) {
        inputs.onTileDestory(tile);
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

  function updateTilesWhileEyesMoving(eyes: THREE.Vector3) {
    const nextTiles: EarthTile[] = [];

    camera.updateMatrixWorld();

    cameraProjectionMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );

    cameraFrustum.setFromProjectionMatrix(cameraProjectionMatrix);

    const rootTiles = getGlobalTilesAtZoom(1);

    for (const tile of rootTiles) {
      traverseVisibleTiles(tile, eyes, nextTiles);
    }

    tilesManager.replace(nextTiles);

    renderTiles();
    disposeTiles();
  }

  function getVisibleTiles(eyes: THREE.Vector3) {
    const nextTiles: EarthTile[] = [];

    camera.updateMatrixWorld();

    cameraProjectionMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );

    cameraFrustum.setFromProjectionMatrix(cameraProjectionMatrix);

    const rootTiles = getGlobalTilesAtZoom(1);

    for (const tile of rootTiles) {
      traverseVisibleTiles(tile, eyes, nextTiles);
    }

    return nextTiles;
  }

  function update() {
    if (updateEnabled) {
      const camPos = camera.position.clone();
      updateTilesWhileEyesMoving(camPos);
    }
  }

  //#region debug
  let updateEnabled = true;
  let frustumSnapshot: THREE.CameraHelper | null = null;

  function removeFrustumSnapshot() {
    if (!frustumSnapshot) {
      return;
    }

    // scene.remove(frustumSnapshot);
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
    // scene.add(frustumSnapshot);
  }
  //#endregion

  let controls: OrbitControls = null;
  let speedNoUpdate = false;

  function getAltitude() {
    const distanceToCenter = camera.position.length();
    const altitude = distanceToCenter - EARTH_RADIUS;
    return altitude;
  }

  function adjustControlsZoomSpeed(altitude: number) {
    const zoom = getZoomLevel(altitude);

    controls.zoomSpeed = THREE.MathUtils.clamp(
      1.5 * (1 / Math.pow(2, zoom)),
      0.000001,
      1.5,
    );

    controls.rotateSpeed = THREE.MathUtils.clamp(
      1 / Math.pow(2, zoom),
      0.000001,
      1,
    );
  }

  function adjustFarNear(altitude: number) {
    // Keep near positive and not too tiny for depth precision.
    const near = THREE.MathUtils.clamp(altitude * 0.1, 10, EARTH_RADIUS * 0.1);

    // Horizon distance from camera to tangent point on the sphere.
    const distanceToCenter = EARTH_RADIUS + altitude;
    const horizonDistance = Math.sqrt(
      Math.max(
        0,
        distanceToCenter * distanceToCenter - EARTH_RADIUS * EARTH_RADIUS,
      ),
    );

    // Add margin and guarantee far remains greater than near.
    const far = Math.max(horizonDistance * 1.1, near + 1_000);

    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }

  function getViewCenterLatlng(): LatLng {
    const earthSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      EARTH_RADIUS,
    );

    const centerRaycaster = new THREE.Raycaster();
    const centerNdc = new THREE.Vector2(0, 0);
    const hitPoint = new THREE.Vector3();

    centerRaycaster.setFromCamera(centerNdc, camera);
    const hasHit =
      centerRaycaster.ray.intersectSphere(earthSphere, hitPoint) !== null;

    if (!hasHit) {
      return;
    }

    const latlng = sphereToLatlng(hitPoint.x, hitPoint.y, hitPoint.z);

    const clampedLat = THREE.MathUtils.clamp(
      latlng.lat,
      -85.05112878,
      85.05112878,
    );

    const wrappedLng = ((((latlng.lng + 180) % 360) + 360) % 360) - 180;

    return { lat: clampedLat, lng: wrappedLng };
  }

  function getLookAtZoom() {
    if (state.lookat === "latlng") {
      return getZoomLevel(camera.position.distanceTo(controls.target));
    } else {
      return getZoomLevel(camera.position.length() - EARTH_RADIUS);
    }
  }

  const state: ViewerState = {
    lookat: "origin",
    zoomLevel: 0,
    elevation: {
      min: 0,
      max: 0,
    },
  };

  const handleCameraMove = () => {
    const altitude = getAltitude();

    if (speedNoUpdate) {
    } else {
      adjustControlsZoomSpeed(altitude);
    }

    adjustFarNear(altitude);

    update();

    const zl = getLookAtZoom();

    if (zl !== state.zoomLevel) {
      state.zoomLevel = zl;
      console.log("zoom changed", zl);
      runDispatches({ name: "zoomLevel", value: zl });
    }
  };

  function computeOrbitPositionFromAzimuthAltitude(
    target: THREE.Vector3,
    azimuthDeg: number,
    altitudeDeg: number,
    radiusMeters: number,
  ) {
    const { up, east, north } = getLocalBasisAtPoint(target);
    const azimuthRad = THREE.MathUtils.degToRad(azimuthDeg);
    const altitudeRad = THREE.MathUtils.degToRad(altitudeDeg);

    const horizontal = east
      .clone()
      .multiplyScalar(Math.sin(azimuthRad))
      .add(north.clone().multiplyScalar(Math.cos(azimuthRad)));

    const viewDirection = horizontal
      .multiplyScalar(Math.cos(altitudeRad))
      .add(up.multiplyScalar(Math.sin(altitudeRad)))
      .normalize();

    return target.clone().addScaledVector(viewDirection, radiusMeters);
  }

  currentThreeDTilesViewer = {
    state,
    getZoom: getZoomLevel,
    getTileCount: () => tilesManager.tiles.length,
    dispose: () => {
      console.log("viewer disposed");
      controls.removeEventListener("end", handleCameraMove);
      currentThreeDTilesViewer = null;
    },
    useOrbitControls: (_controls) => {
      if (controls !== null) return;

      controls = _controls;

      controls.target.set(0, 0, 0);
      controls.enableDamping = true;

      controls.minDistance = EARTH_RADIUS + 100;
      controls.maxDistance = EARTH_RADIUS * 2;

      controls.addEventListener("end", handleCameraMove);

      handleCameraMove();
    },
    lookAtLatlng: (latlng0: LatLng = null) => {
      if (state.lookat === "latlng") return;

      const latlng = latlng0 ?? getViewCenterLatlng();

      const point = latlngToSphere(latlng.lat, latlng.lng, state.elevation.min);

      controls.target.set(point.x, point.y, point.z);

      const target = new THREE.Vector3(point.x, point.y, point.z);
      const localUp = target.clone().normalize();
      camera.up.copy(localUp);

      const camDistance = camera.position.distanceTo(target);

      const cameraPos = computeOrbitPositionFromAzimuthAltitude(
        target,
        180,
        45,
        camDistance,
      );

      camera.position.copy(cameraPos);

      controls.minDistance = 500;
      controls.maxDistance = EARTH_RADIUS;

      camera.lookAt(controls.target);
      controls.update();
      update();

      controls.rotateSpeed = 1;
      controls.zoomSpeed = 1;

      speedNoUpdate = true;

      state.lookat = "latlng";
      runDispatches({ name: "lookat", value: "latlng" });
    },
    lookAtOrigin: () => {
      if (state.lookat === "origin") return;

      const worldCenter = new THREE.Vector3(0, 0, 0);

      const currentTarget = controls.target.clone();
      controls.target.copy(worldCenter);

      const minRadius = EARTH_RADIUS + 500;
      const cameraDir = currentTarget.normalize();
      const nextRadius = Math.max(camera.position.length(), minRadius);
      camera.position.copy(cameraDir.multiplyScalar(nextRadius));

      camera.up.set(0, 1, 0);

      controls.minDistance = minRadius;
      controls.maxDistance = EARTH_RADIUS * 2;

      camera.lookAt(worldCenter);
      controls.update();

      update();

      speedNoUpdate = false;

      adjustControlsZoomSpeed(getAltitude());

      state.lookat = "origin";
      runDispatches({ name: "lookat", value: "origin" });
    },
    enableUpdate: (enabled: boolean) => {
      updateEnabled = enabled;
    },
    /**
     * update per frame.
     */
    update,
    setElevationRange: (minMeters: number, maxMeters: number) => {
      const safeMinElevation = Number.isFinite(minMeters) ? minMeters : 0;
      const safeMaxElevation =
        Number.isFinite(maxMeters) && maxMeters >= safeMinElevation
          ? maxMeters
          : safeMinElevation;

      tilesManager.setElevationRange(safeMinElevation, safeMaxElevation);

      state.elevation.min = safeMinElevation;
      state.elevation.max = safeMaxElevation;

      runDispatches({
        name: "elevation",
        value: { min: safeMinElevation, max: safeMaxElevation },
      });
    },
    getElevationRange: () => {
      return {
        min: tilesManager.avgMinElevation,
        max: tilesManager.avgMaxElevation,
      };
    },
    getVisibleTiles,
    /**
     * According to given zoom value `Z`,
     * get the min distance where the zoom reaches `Z`.
     */
    zoomToDistance: (zoom: number) => {
      const safeZoom = clampZoom(zoom);
      return safeBaseDistance / Math.pow(2, safeZoom);
    },
    /**
     * According to dist, get the zoom there.
     */
    distanceToZoom: getZoomLevel,
    getLookAtZoom: getLookAtZoom,
  };

  Object.setPrototypeOf(
    currentThreeDTilesViewer,
    THREE.EventDispatcher.prototype,
  );

  return currentThreeDTilesViewer;
}

type ViewerState = {
  zoomLevel: number;
  lookat: "origin" | "latlng";
  elevation: {
    min: number;
    max: number;
  };
};

type ViewerStateKey = keyof ViewerState;

export let currentThreeDTilesViewer: Create3dTilesViewer = null;

type Action<K extends ViewerStateKey = ViewerStateKey> = {
  name: K;
  value: ViewerState[K];
};

const currentThreeDTilesViewerStateReducer = (
  state: ViewerState,
  action: Action,
) => {
  console.log(currentThreeDTilesViewer);

  if (currentThreeDTilesViewer) {
    console.log("hi");
    // @ts-expect-error
    currentThreeDTilesViewer.dispatchEvent({
      type: `change:${action.name}`,
      ...action,
    });
  }

  return { ...state, [action.name]: action.value };
};

type Meta = {
  field: keyof ViewerState;
  dispatch: React.ActionDispatch<[action: Action]>;
};

const dispatches = new Set<Meta>();

const runDispatches = (action: Action) => {
  for (const dispatch of dispatches) {
    if (!dispatch.field || (dispatch.field && action.name === dispatch.field)) {
      dispatch.dispatch(action);
    }
  }
};

export const useCurrentThreeDTilesViewerState = <K extends ViewerStateKey>(
  field: K,
): ViewerState[K] => {
  const [state, dispatchState] = useReducer(
    currentThreeDTilesViewerStateReducer,
    currentThreeDTilesViewer.state,
  );

  useEffect(() => {
    const meta: Meta = {
      field,
      dispatch: dispatchState,
    };

    dispatches.add(meta);
    console.log("dis size", dispatches.size);
    return () => {
      dispatches.delete(meta);
      console.log("dis size", dispatches.size);
    };
  }, [field]);

  return state[field];
};
