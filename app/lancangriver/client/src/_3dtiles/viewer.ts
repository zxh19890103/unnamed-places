import * as THREE from 'three';
import { EarthTile, EarthTilesManager } from './tile.js';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ExploreControls } from '@/explore/controls/ExploreControls.class.js';
import { EARTH_RADIUS, LatLng, latlngToSphere, sphereToLatlng } from './core.js';
import { useEffect, useReducer } from 'react';
import { getLocalBasisAtPoint } from '@/calc/sphere.js';

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
};

function create3dTilesViewer({
  camera,
  baseDistance = 46188_000,
  maxZoom = 21,
}: Create3dTilesViewerInputs) {
  const minZoom = 0;

  const safeBaseDistance = Number.isFinite(baseDistance) && baseDistance > 0 ? baseDistance : 1;

  function clampZoom(zoom: number) {
    return THREE.MathUtils.clamp(Math.floor(zoom), minZoom, maxZoom);
  }

  function distToZoom(dist: number) {
    if (!Number.isFinite(dist)) return minZoom;
    if (dist <= 0) return maxZoom;

    const zoomLevel = Math.floor(Math.log2(safeBaseDistance / dist));
    if (!Number.isFinite(zoomLevel)) {
      return minZoom;
    }

    return clampZoom(zoomLevel);
  }

  function traverseVisibleTiles(tile: EarthTile, eyes: THREE.Vector3, results: EarthTile[]) {
    if (tile.zoom > 3 && !tile.isInFrustum(cameraFrustum)) {
      return;
    }

    if (tile.zoom >= maxZoom) {
      results.push(tile);
      return;
    }

    const closestDist = tile.distanceTo(eyes);
    const targetZoom = distToZoom(closestDist);
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

  function getVisibleTiles(eyes: THREE.Vector3) {
    const nextTiles: EarthTile[] = [];

    camera.updateMatrixWorld();

    cameraProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    cameraFrustum.setFromProjectionMatrix(cameraProjectionMatrix);

    const rootTiles = getGlobalTilesAtZoom(1);

    for (const tile of rootTiles) {
      traverseVisibleTiles(tile, eyes, nextTiles);
    }

    tilesManager.replace(nextTiles);
    return nextTiles;
  }

  let controls: ExploreControls = null;
  let speedNoUpdate = false;
  let flyToAnimationFrame: number | null = null;

  function getCameraAltitude() {
    const distanceToCenter = camera.position.length();
    const altitude = distanceToCenter - EARTH_RADIUS;
    return altitude;
  }

  function adjustControlsZoomSpeed(altitude: number) {
    const zoom = distToZoom(altitude);

    controls.zoomSpeed = THREE.MathUtils.clamp(1.5 * (1 / Math.pow(2, zoom)), 0.000001, 1.5);

    controls.rotateSpeed = THREE.MathUtils.clamp(1 / Math.pow(2, zoom), 0.000001, 1);
  }

  function adjustCameraFarNear(altitude: number) {
    // Keep near positive and not too tiny for depth precision.
    const near = THREE.MathUtils.clamp(altitude * 0.1, 10, EARTH_RADIUS * 0.1);

    // Horizon distance from camera to tangent point on the sphere.
    const distanceToCenter = EARTH_RADIUS + altitude;
    const horizonDistance = Math.sqrt(
      Math.max(0, distanceToCenter * distanceToCenter - EARTH_RADIUS * EARTH_RADIUS),
    );

    // Add margin and guarantee far remains greater than near.
    const far = Math.max(horizonDistance * 1.1, near + 1_000);

    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }

  function getLookAtZoom() {
    if (state.lookat === 'latlng') {
      return distToZoom(camera.position.distanceTo(controls.target));
    } else {
      return distToZoom(camera.position.length() - EARTH_RADIUS);
    }
  }

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

  function getCameraLatLng(): LatLng {
    return sphereToLatlng(camera.position.x, camera.position.y, camera.position.z);
  }

  const earthSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), EARTH_RADIUS);

  function getCenterRayHit() {
    const centerRaycaster = new THREE.Raycaster();
    const centerNdc = new THREE.Vector2(0, 0);
    const hitPoint = new THREE.Vector3();

    centerRaycaster.setFromCamera(centerNdc, camera);
    const hasHit = centerRaycaster.ray.intersectSphere(earthSphere, hitPoint) !== null;

    if (!hasHit) {
      return null;
    }

    return hitPoint;
  }

  function getViewCenterLatlng(): LatLng {
    const hitPoint = getCenterRayHit();

    if (!hitPoint) {
      return null;
    }

    return sphereToLatlng(hitPoint.x, hitPoint.y, hitPoint.z);
  }

  const updateViewerState = () => {
    const altitude = getCameraAltitude();

    if (speedNoUpdate) {
      //
    } else {
      adjustControlsZoomSpeed(altitude);
    }

    adjustCameraFarNear(altitude);

    state.position.copy(camera.position);
    state.alt = altitude;
    state.latlng = getCameraLatLng();

    const centerHit = getCenterRayHit();

    state.center = getViewCenterLatlng();
    state.distance = centerHit ? camera.position.distanceTo(centerHit) : -1;

    state.zoom = getLookAtZoom();

    state.tilesCount = tilesManager.tiles.length;

    runDispatches({ name: 'any', value: { ...state } });
  };

  const state: ViewerState = {
    tilesCount: 0,
    latlng: { lat: 0, lng: 0 },
    position: camera.position.clone(),
    alt: getCameraAltitude(),
    distance: -1,
    center: null,
    zoom: 0,
    lookat: 'origin',
    elevation: {
      min: 0,
      max: 0,
    },
  };

  const viewer = {
    state,
    getCameraLatLng,
    getViewCenterLatlng,
    dispose: () => {
      controls.removeEventListener('end', updateViewerState);
      currentThreeDTilesViewer = null;
    },
    useControls: (_controls) => {
      if (controls !== null) return;

      controls = _controls;

      controls.target.set(0, 0, 0);
      controls.enableDamping = true;

      controls.minDistance = EARTH_RADIUS + 100;
      controls.maxDistance = EARTH_RADIUS * 2;

      controls.addEventListener('end', updateViewerState);

      updateViewerState();
    },
    flyTo: (latlng: LatLng) => {
      if (flyToAnimationFrame !== null) {
        cancelAnimationFrame(flyToAnimationFrame);
        flyToAnimationFrame = null;
      }

      const startPosition = camera.position.clone();
      const alt0 = getCameraAltitude();
      const targetAltitude = Math.min(latlng.alt ?? alt0, 5_000);

      const targetPointVec = new THREE.Vector3().copy(latlngToSphere(latlng.lat, latlng.lng, 0));
      const targetPosition = new THREE.Vector3().copy(
        latlngToSphere(latlng.lat, latlng.lng, targetAltitude),
      );

      const startDirection = startPosition.clone().sub(targetPointVec).normalize();
      const targetDirection = targetPosition.clone().sub(targetPointVec).normalize();
      const startDistance = startPosition.distanceTo(targetPointVec);
      const targetDistance = targetPosition.distanceTo(targetPointVec);

      const orbitRotation = new THREE.Quaternion().setFromUnitVectors(
        startDirection,
        targetDirection,
      );
      const startOrientation = camera.quaternion.clone();
      const lookDirection = new THREE.Vector3(0, 0, -1);
      const targetOrientation = new THREE.Quaternion().setFromUnitVectors(
        lookDirection,
        targetPointVec.clone().sub(targetPosition).normalize(),
      );

      const durationMs = 12_000;
      const startTime = performance.now();

      return new Promise<void>((resolve) => {
        const animate = (now: number) => {
          const elapsed = Math.min(1, (now - startTime) / durationMs);
          const eased = 0.5 - 0.5 * Math.cos(elapsed * Math.PI);

          const currentRotation = new THREE.Quaternion().identity().slerp(orbitRotation, eased);
          const currentDirection = startDirection.clone().applyQuaternion(currentRotation);
          const currentDistance = startDistance + (targetDistance - startDistance) * eased;
          const nextPosition = targetPointVec
            .clone()
            .add(currentDirection.multiplyScalar(currentDistance));

          camera.position.copy(nextPosition);
          camera.quaternion.copy(startOrientation.clone().slerp(targetOrientation, eased));
          camera.up.set(0, 1, 0);
          camera.updateMatrixWorld();

          adjustCameraFarNear(getCameraAltitude());
          controls?.update();

          if (elapsed < 1) {
            flyToAnimationFrame = requestAnimationFrame(animate);
            return;
          }

          camera.position.copy(targetPosition);
          camera.quaternion.copy(targetOrientation);
          camera.up.set(0, 1, 0);
          camera.updateMatrixWorld();

          adjustCameraFarNear(getCameraAltitude());
          controls?.update();

          flyToAnimationFrame = null;
          resolve();
        };

        flyToAnimationFrame = requestAnimationFrame(animate);
      });
    },
    lookAtLatlng: (latlng0: LatLng = null, maxRadius: number = 5_000) => {
      if (state.lookat === 'latlng') return;

      const latlng = latlng0 ?? getViewCenterLatlng();

      const base = state.elevation.min;

      const point = latlngToSphere(latlng.lat, latlng.lng, base);

      controls.target.set(point.x, point.y, point.z);

      const target = new THREE.Vector3(point.x, point.y, point.z);
      const localUp = target.clone().normalize();
      camera.up.copy(localUp);

      const camDistance = camera.position.distanceTo(target);
      const radius = Math.min(camDistance, maxRadius);

      const cameraPos = computeOrbitPositionFromAzimuthAltitude(target, 180, 45, radius);

      camera.position.copy(cameraPos);

      controls.minDistance = 500;
      controls.maxDistance = EARTH_RADIUS;

      camera.lookAt(controls.target);
      controls.update();

      controls.rotateSpeed = 1;
      controls.zoomSpeed = 1;

      speedNoUpdate = true;

      state.lookat = 'latlng';
      runDispatches({ name: 'lookat', value: 'latlng' });
    },
    lookAtOrigin: () => {
      if (state.lookat === 'origin') return;

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

      speedNoUpdate = false;

      adjustControlsZoomSpeed(getCameraAltitude());

      state.lookat = 'origin';
      runDispatches({ name: 'lookat', value: 'origin' });
    },
    setElevationRange: (minMeters: number, maxMeters: number) => {
      const safeMinElevation = Number.isFinite(minMeters) ? minMeters : 0;
      const safeMaxElevation =
        Number.isFinite(maxMeters) && maxMeters >= safeMinElevation ? maxMeters : safeMinElevation;

      tilesManager.setElevationRange(safeMinElevation, safeMaxElevation);

      state.elevation.min = safeMinElevation;
      state.elevation.max = safeMaxElevation;

      runDispatches({
        name: 'elevation',
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
    distanceToZoom: distToZoom,
  };

  return viewer;
}

export function initialize3DTilesViewer(inputs: Create3dTilesViewerInputs) {
  const viewer = create3dTilesViewer(inputs) as Create3dTilesViewer;

  Object.setPrototypeOf(viewer, THREE.EventDispatcher.prototype);

  currentThreeDTilesViewer = viewer;
  return viewer;
}

type ViewerState = {
  /** Camera position as lat/lng. */
  latlng: LatLng;
  /** Camera position in world space. */
  position: THREE.Vector3;
  /** Camera altitude above sea level, in meters. */
  alt: number;
  /** Distance from camera to the earth surface at viewport center. `-1` when the earth is not in view. */
  distance: number;
  /** Lat/lng at the center of the viewport. `null` when the earth is not in view. */
  center: LatLng | null;
  /** Current tile zoom level. */
  zoom: number;
  /** Camera look mode: origin (world center) or latlng (ground orbit). */
  lookat: 'origin' | 'latlng';
  /** Visible elevation range in meters. */
  tilesCount: number;

  elevation: {
    min: number;
    max: number;
  };
};

type ViewerStateKey = keyof ViewerState;
type ActionName = 'any' | ViewerStateKey;

type Action<K extends ActionName = ActionName> = {
  name: K;
  value: K extends ViewerStateKey ? ViewerState[K] : ViewerState;
};

type ViewerEventMap = {
  [K in ViewerStateKey as `change:${K}`]: Action<K>;
};

export type Create3dTilesViewer = ReturnType<typeof create3dTilesViewer> &
  THREE.EventDispatcher<ViewerEventMap>;

export let currentThreeDTilesViewer: Create3dTilesViewer = null;

function dispatchViewerChange<K extends ActionName>(action: Action<K>) {
  if (!currentThreeDTilesViewer) return;

  const type: `change:${K}` = `change:${action.name}`;
  currentThreeDTilesViewer.dispatchEvent({
    type: type,
    ...action,
  } as Parameters<typeof currentThreeDTilesViewer.dispatchEvent>[0]);
}

const currentThreeDTilesViewerStateReducer = (state: ViewerState, action: Action): ViewerState => {
  dispatchViewerChange(action);

  if (action.name === 'any') {
    return action.value as ViewerState;
  } else {
    return { ...state, [action.name]: action.value };
  }
};

type Meta = {
  field: ActionName;
  dispatch: React.ActionDispatch<[action: Action]>;
};

const dispatches = new Set<Meta>();

const runDispatches = (action: Action) => {
  for (const dispatch of dispatches) {
    const isAny = !dispatch.field;
    if (isAny || (dispatch.field && action.name === dispatch.field)) {
      dispatch.dispatch(action);
    }
  }
};

export const useCurrentThreeDTilesViewerState = <K extends ActionName>(field: K): ViewerState => {
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
    return () => {
      dispatches.delete(meta);
    };
  }, [field]);

  return state;
};
