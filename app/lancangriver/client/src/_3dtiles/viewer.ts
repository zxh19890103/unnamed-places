import * as THREE from 'three';
import { EarthTile, EarthTilesManager } from './tile.js';
import { ExploreControls } from '@/explore/controls/ExploreControls.class.js';
import { EARTH_RADIUS, LatLng, sphereToLatlng } from './core.js';
import { useEffect, useReducer } from 'react';

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

    updateViewerState();
    return nextTiles;
  }

  const updateViewerState = () => {
    state.tilesCount = tilesManager.tiles.length;
    runDispatches({ name: 'any', value: { ...state } });
  };

  const state: ViewerState = {
    tilesCount: 0,
    elevation: {
      min: 0,
      max: 0,
    },
  };

  const viewer = {
    state,
    getLatlng: () => {
      const position = camera.position;
      return sphereToLatlng(position.x, position.y, position.z);
    },
    dispose: () => {
      currentThreeDTilesViewer = null;
    },
    setElevation: (minMeters: number, maxMeters: number) => {
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
