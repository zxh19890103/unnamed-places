import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { EARTH_RADIUS } from "../../calc/sphere.js";
import { Sphere } from "../Sphere.class.js";
import { TilesManager } from "../TilesManager.class.js";
import { ControlsManager, type ControlMode } from "../ControlsManager.class.js";
import { TileMaterialMode } from "../SphereTile.class.js";
import { BASE_URL } from "../../calc/constants.js";
import { LatLng } from "@/calc/types.js";
import { createVendors } from "./vendors.js";
import { createSkyRig, FOG_COLOR, SKY_COLOR } from "./sky.js";
import { createGroundOrbitCloudsController } from "./clouds.js";
import { createPhotoLocationsPresenter } from "./photos.js";
import { create3dTilesViewer } from "@/experiments/sphere-zoom/viewer.js";
import {
  latlngToSphere,
  sphereToLatlng,
} from "@/experiments/sphere-zoom/core.js";
import {
  computeVisibleGroundBBox,
  type LatLngBBox,
} from "./coverageVisibility.js";

export let globalTileMaterialMode: TileMaterialMode = TileMaterialMode.Basic;

export const setGlobalTileMaterialMode = (value: TileMaterialMode) => {
  globalTileMaterialMode = value;
};

const alwaysReturns12Func = () => 12;

export let getZoomLevel = alwaysReturns12Func;

export function createSceneState(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = SKY_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0);

  const { initialCenter, syncSkyWithCamera } = createSkyRig(scene);

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    100,
    EARTH_RADIUS * 2,
  );

  const threeTilesViewer = create3dTilesViewer({
    camera,
    baseDistance: 32_000_000,
    maxZoom: 20,
  });

  getZoomLevel = () =>
    threeTilesViewer.getZoom(
      camera.position.distanceTo(controlsManager.orbitControls.target) -
        EARTH_RADIUS,
    );

  const startCameraPosition = latlngToSphere(
    initialCenter.lat,
    initialCenter.lng,
    EARTH_RADIUS * 0.1,
  );

  camera.position.set(
    startCameraPosition.x,
    startCameraPosition.y,
    startCameraPosition.z,
  );

  camera.lookAt(0, 0, 0);

  const { loadingSnapshot, textureLoader, imageLoader, cloudAtlasTexture } =
    createVendors();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, true);
  container.appendChild(renderer.domElement);

  const stats = new Stats();
  stats.dom.style.position = "static";

  const controlsManager = new ControlsManager({
    threeTilesViewer,
    camera,
    domElement: renderer.domElement,
    renderer,
  });

  const tileManager = new TilesManager();

  const sphereGlobal = new Sphere(
    threeTilesViewer,
    textureLoader,
    imageLoader,
    {
      camera,
      tilesManager: tileManager,
      controlsManager,
      getLoadingSnapshot: () => loadingSnapshot,
    },
  );

  scene.add(sphereGlobal);

  const cloudsController = createGroundOrbitCloudsController({
    scene,
    cloudAtlasTexture,
  });

  const photoLocationsPresenter = createPhotoLocationsPresenter({
    scene,
    textureLoader,
    baseUrl: BASE_URL,
  });

  const reconcileAttachedNodeMaterials = () => {
    for (const node of tileManager.getAttachedNodes()) {
      if (!node.tile) {
        continue;
      }

      node.tile.setMaterialMode(globalTileMaterialMode);
    }
  };

  const refreshVisibleTilesOnCameraChanges = () => {
    if (tileManager.frozen) return;

    const earthTiles = threeTilesViewer.getVisibleTiles(
      camera.position.clone(),
    );

    tileManager.setNodes(earthTiles);
  };

  tileManager.onTileCreate = (node) => {
    const tile = sphereGlobal.createTileByKey(node.key);
    tile.$tNode = node;
    tile.setMaterialMode(globalTileMaterialMode);

    node.tile = tile;
  };

  tileManager.onTileAttach = (node) => {
    if (node.tile) {
      sphereGlobal.attachTile(node.tile);
    }
  };

  tileManager.onTileDetach = (node) => {
    if (node.tile) {
      sphereGlobal.detachTile(node.tile);
    }
  };

  tileManager.onTileDispose = (node) => {
    if (node.tile) {
      sphereGlobal.disposeTile(node.tile);
      node.tile = null;
    }
  };

  const syncCloudsWithCamera = () => {
    const orbitTarget = camera.position
      .clone()
      .normalize()
      .multiplyScalar(EARTH_RADIUS);

    const cloudLatLng = sphereToLatlng(
      orbitTarget.x,
      orbitTarget.y,
      orbitTarget.z,
    );

    const cameraDistanceMeters = Math.max(
      1,
      2.5 * (camera.position.length() - EARTH_RADIUS),
    );

    cloudsController.syncCloudsAtTarget({
      latlng: cloudLatLng,
      orbitTarget,
      cameraDistanceMeters,
      viewportHeight: container.clientHeight,
    });
  };

  controlsManager.onModeChange = (from: ControlMode, to: ControlMode) => {
    console.log(`[Controls] Mode change: ${from} → ${to}`);
    if (to === "fly") {
      tileManager.frozen = true;
      const modeLabel = to === "fly" ? "fly compositor" : "ground orbit";
      console.log(`[Tiles] Entering resolution mode (${modeLabel})`);
    } else {
      tileManager.frozen = false;
      reconcileAttachedNodeMaterials();
      console.log("[Tiles] Tile finding resumed");
      refreshVisibleTilesOnCameraChanges();
    }
  };

  controlsManager.pointerControls.onChange = () => {
    syncCloudsWithCamera();
    refreshVisibleTilesOnCameraChanges();
  };

  controlsManager.orbitControls.addEventListener("end", () => {
    reconcileAttachedNodeMaterials();
    refreshVisibleTilesOnCameraChanges();
    syncCloudsWithCamera();
  });

  threeTilesViewer.useOrbitControls(controlsManager.orbitControls);

  const getCurrentCameraLatlng = () => {
    const pos = camera.position;
    return sphereToLatlng(pos.x, pos.y, pos.z);
  };

  const getCurrentGroundCenterLatLng = () => {
    const target = camera.position;
    return sphereToLatlng(target.x, target.y, target.z);
  };

  const setVisibleTilesElevationRange = (
    minMeters: number,
    maxMeters: number,
  ) => {
    threeTilesViewer.setElevationRange(minMeters, maxMeters);
    refreshVisibleTilesOnCameraChanges();
  };

  const getVisibleGroundBBox = (): LatLngBBox | null =>
    computeVisibleGroundBBox({
      camera,
      viewportWidth: renderer.domElement.clientWidth,
      viewportHeight: renderer.domElement.clientHeight,
    });

  const focusGroundOrbitAtLatLng = async (centerLatlng: LatLng) => {
    threeTilesViewer.lookAtLatlng(centerLatlng);

    const orbitLatlng = centerLatlng;
    const orbitTarget = controlsManager.orbitControls.target.clone();

    const cameraDistanceMeters =
      2.5 * (camera.position.length() - EARTH_RADIUS);

    syncSkyWithCamera({
      orbitCenter: orbitTarget,
      cameraDistanceMeters,
    });

    cloudsController.syncCloudsAtTarget({
      latlng: orbitLatlng,
      orbitTarget,
      cameraDistanceMeters,
      viewportHeight: container.clientHeight,
    });

    refreshVisibleTilesOnCameraChanges();
  };

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, true);
    cloudsController.syncViewportHeight(height);
  };

  const destroyStats = () => {
    if (stats.dom.parentElement === container) {
      container.removeChild(stats.dom);
    }
  };

  refreshVisibleTilesOnCameraChanges();
  syncCloudsWithCamera();

  return {
    scene,
    camera,
    renderer,
    controlsManager,
    sphere: sphereGlobal,
    stats,
    tileManager,
    resize,
    refreshVisibleTilesOnCameraChanges,
    getCurrentCenterLatLng: getCurrentCameraLatlng,
    getCurrentGroundCenterLatLng,
    setVisibleTilesElevationRange,
    getVisibleGroundBBox,
    focusGroundOrbitAtLatLng,
    showPhotosLocations: photoLocationsPresenter.showPhotosLocations,
    threeTilesViewer,
    onFrame: (frameTimeMs: number) => {
      sphereGlobal.recordFrameTime(frameTimeMs);
      syncCloudsWithCamera();
    },
    cleanup: () => {
      getZoomLevel = alwaysReturns12Func;
      cloudsController.dispose();
      photoLocationsPresenter.dispose();
      sphereGlobal.dispose();
      controlsManager.dispose();
      destroyStats();
      renderer.dispose();
    },
  };
}

export type SceneState = ReturnType<typeof createSceneState>;
