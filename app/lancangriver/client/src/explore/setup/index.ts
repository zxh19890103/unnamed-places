import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { EARTH_RADIUS } from "../../calc/sphere.js";
import { Sphere } from "../Sphere.class.js";
import { TilesManager } from "../TilesManager.class.js";
import { ControlsManager, type ControlMode } from "../ControlsManager.class.js";
import { attachExploreGui, type ExploreGuiHandle } from "./gui.js";
import { TileMaterialMode } from "../SphereTile.class.js";
import { BASE_URL, MAX_DEM_ZOOM } from "../../calc/constants.js";
import { LatLng } from "../../calc/types.js";
import { OsmBuildingTilesController } from "../OsmBuildingTilesController.class.js";
import { createVendors } from "./vendors.js";
import { createSkyRig, FOG_COLOR, SKY_COLOR } from "./sky.js";
import { createGroundOrbitCloudsController } from "./clouds.js";
import { computeOrbitPositionFromAzimuthAltitude } from "./orbit.js";
import { createPhotoLocationsPresenter } from "./photos.js";
import { create3dTilesViewer } from "../../experiments/sphere-zoom/viewer.js";
import {
  latlngToSphere,
  sphereToLatlng,
} from "../../experiments/sphere-zoom/core.js";

export function createScene(container: HTMLElement) {
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

  const threeTilesViewer = create3dTilesViewer({ camera });

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
  stats.dom.style.position = "fixed";
  stats.dom.style.top = "0";
  stats.dom.style.left = "";
  stats.dom.style.right = "265px";
  container.appendChild(stats.dom);

  const controlsManager = new ControlsManager({
    threeTilesViewer,
    camera,
    domElement: renderer.domElement,
    renderer,
  });

  const tileManager = new TilesManager();
  const osmBuildingTiles = new OsmBuildingTilesController({
    scene,
    baseUrl: BASE_URL,
  });

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

  let guiHandle: ExploreGuiHandle | null = null;

  const terrainState = {
    materialMode: TileMaterialMode.Basic,
  };

  const reconcileAttachedNodeMaterials = () => {
    for (const node of tileManager.getAttachedNodes()) {
      if (!node.tile) {
        continue;
      }

      node.tile.setMaterialMode(terrainState.materialMode);
    }
  };

  const applyMaterialModeToAttachedTiles = (mode: TileMaterialMode) => {
    for (const node of tileManager.getAttachedNodes()) {
      if (node.tile) {
        node.tile.setMaterialMode(mode);
      }
    }
  };

  const applyMaterialMode = (
    requested: TileMaterialMode,
    zoomLevel: number,
  ) => {
    if (
      (requested === TileMaterialMode.Dem ||
        requested === TileMaterialMode.DemAdvance) &&
      zoomLevel > MAX_DEM_ZOOM
    ) {
      console.warn(
        `[Terrain] DEM material is disabled above z=${MAX_DEM_ZOOM} (current z=${zoomLevel})`,
      );
      return false;
    }

    terrainState.materialMode = requested;
    applyMaterialModeToAttachedTiles(requested);
    return true;
  };

  tileManager.onTileCreate = (node) => {
    const tile = sphereGlobal.createTileByKey(node.key);
    tile.$tNode = node;
    tile.setMaterialMode(terrainState.materialMode);
    node.tile = tile;
    osmBuildingTiles.onTileCreate(node);
  };

  tileManager.onTileAttach = (node) => {
    if (node.tile) {
      sphereGlobal.attachTile(node.tile);
    }
    osmBuildingTiles.onTileAttach(node);
  };

  tileManager.onTileDetach = (node) => {
    if (node.tile) {
      sphereGlobal.detachTile(node.tile);
    }
    osmBuildingTiles.onTileDetach(node);
  };

  tileManager.onTileDispose = (node) => {
    if (node.tile) {
      sphereGlobal.disposeTile(node.tile);
      node.tile = undefined;
    }
    osmBuildingTiles.onTileDispose(node);
  };

  const triggerCreateOsmTilesOnce = () => {
    return osmBuildingTiles.triggerCreateOnce(tileManager.getAttachedNodes());
  };

  const refreshVisibleTilesOnCameraChanges = () => {
    if (tileManager.frozen) return;

    // const visibleTileKeys = getVisibleTiles(camera, zoomLevel, EARTH_RADIUS);
    const earthTiles = threeTilesViewer.getVisibleTiles(
      camera.position.clone(),
    );

    tileManager.setNodes(earthTiles);
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

  controlsManager.getPointerControls().onChange = () => {
    refreshVisibleTilesOnCameraChanges();
  };

  controlsManager.getOrbitControls().addEventListener("end", () => {
    console.log("hi");
    reconcileAttachedNodeMaterials();
    refreshVisibleTilesOnCameraChanges();
  });

  threeTilesViewer.useOrbitControls(controlsManager.getOrbitControls());

  controlsManager.getGroundOrbitcontrols().addEventListener("end", () => {
    reconcileAttachedNodeMaterials();
    refreshVisibleTilesOnCameraChanges();
  });

  const getCurrentCameraLatlng = () => {
    const pos = camera.position;
    return sphereToLatlng(pos.x, pos.y, pos.z);
  };

  const getLowAltitudeViewPoint = async (at: LatLng, alt: number = 0) => {
    const point = latlngToSphere(at.lat, at.lng, alt);
    return new THREE.Vector3(point.x, point.y, point.z);
  };

  const applyGroundOrbitPlacement = async (targetLatlng?: LatLng) => {
    const orbitLatlng = targetLatlng ?? getCurrentCameraLatlng();
    const orbitTarget = await getLowAltitudeViewPoint(orbitLatlng, 0);

    const cameraDistanceMeters =
      2.5 * (camera.position.length() - EARTH_RADIUS);

    syncSkyWithCamera({
      orbitCenter: orbitTarget,
      cameraDistanceMeters,
    });

    const orbitPosition = computeOrbitPositionFromAzimuthAltitude(
      orbitTarget,
      180,
      45,
      cameraDistanceMeters,
    );

    cloudsController.replaceCloudsAtTarget({
      latlng: orbitLatlng,
      orbitTarget,
      cameraDistanceMeters,
      viewportHeight: container.clientHeight,
    });

    controlsManager.enterGroundOrbit(orbitTarget, orbitPosition);
    refreshVisibleTilesOnCameraChanges();

    const newOrbitTarget = await getLowAltitudeViewPoint(orbitLatlng);
    syncSkyWithCamera({
      orbitCenter: newOrbitTarget,
      cameraDistanceMeters,
    });
    const newOrbitPosition = computeOrbitPositionFromAzimuthAltitude(
      newOrbitTarget,
      180,
      45,
      cameraDistanceMeters,
    );
    cloudsController.replaceCloudsAtTarget({
      latlng: orbitLatlng,
      orbitTarget: newOrbitTarget,
      cameraDistanceMeters,
      viewportHeight: container.clientHeight,
    });
    controlsManager.enterGroundOrbit(newOrbitTarget, newOrbitPosition);
  };

  const focusGroundOrbitAtLatLng = async (centerLatlng: LatLng) => {
    threeTilesViewer.useOrbitControls(controlsManager.getGroundOrbitcontrols());
    threeTilesViewer.lookAtLatlng();

    await applyGroundOrbitPlacement(centerLatlng);

    return { centerTile: null, focusTiles: [] };
  };

  guiHandle = attachExploreGui({
    threeTilesViewer,
    camera,
    controlsManager,
    onRefreshVisibleTilesAndStats: refreshVisibleTilesOnCameraChanges,
    getMaterialMode: () => terrainState.materialMode,
    applyMaterialMode,
    triggerCreateOsmTilesOnce,
    getOsmTilesCreated: () => osmBuildingTiles.isCreationTriggered(),
  });

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, true);
    cloudsController.syncViewportHeight(height);
  };

  const destroyCameraGui = () => guiHandle?.destroy();
  const destroyStats = () => {
    if (stats.dom.parentElement === container) {
      container.removeChild(stats.dom);
    }
  };

  refreshVisibleTilesOnCameraChanges();

  return {
    scene,
    camera,
    renderer,
    controlsManager,
    sphere: sphereGlobal,
    stats,
    tileManager,
    resize,
    getCurrentCenterLatLng: getCurrentCameraLatlng,
    focusGroundOrbitAtLatLng,
    destroyCameraGui,
    destroyStats,
    showPhotosLocations: photoLocationsPresenter.showPhotosLocations,
    cleanup: () => {
      cloudsController.dispose();
      photoLocationsPresenter.dispose();
      osmBuildingTiles.dispose();
      sphereGlobal.dispose();
      controlsManager.dispose();
    },
  };
}
