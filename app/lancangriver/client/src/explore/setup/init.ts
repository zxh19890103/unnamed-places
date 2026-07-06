import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import {
  EARTH_RADIUS,
  latlngToSphere,
  sphereToLatlng,
} from "../../calc/sphere";
import {
  disatanceToZoom,
  latlngToTilekey,
  zoomToDistance,
} from "../../calc/mercator";
import { Sphere } from "../Sphere.class";
import { TilesManager } from "../TilesManager.class";
import { getVisibleTiles } from "../visibleTiles";
import { ControlsManager, type ControlMode } from "../ControlsManager.class";
import { attachExploreGui, type ExploreGuiHandle } from "../gui";
import { TileMaterialMode } from "../SphereTile.class";
import { BASE_URL, MAX_DEM_ZOOM } from "../../calc/constants";
import { LatLng, SphereTileKey } from "../../calc/types";
import { OsmBuildingTilesController } from "../OsmBuildingTilesController.class";
import { createVendors } from "./vendors";
import { createSkyRig, FOG_COLOR, SKY_COLOR } from "./sky";
import { createGroundOrbitCloudsController } from "./clouds";
import { GroundOrbitState } from "./types";
import { computeOrbitPositionFromAzimuthAltitude } from "./orbit";
import {
  getFocusNeighborTiles,
  getFocusZoomLevel,
  waitForAttachedTiles,
} from "./focus";
import { createPhotoLocationsPresenter } from "./photos";

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

  const startCameraPosition = latlngToSphere(
    initialCenter.lat,
    initialCenter.lng,
    EARTH_RADIUS * 1.5,
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
    camera,
    domElement: renderer.domElement,
    renderer,
  });

  const groundOrbitState: GroundOrbitState = {
    enabled: false,
    azimuthDeg: 180,
    altitudeDeg: 30,
  };

  const tileManager = new TilesManager();
  const osmBuildingTiles = new OsmBuildingTilesController({
    scene,
    baseUrl: BASE_URL,
  });

  const sphereGlobal = new Sphere(textureLoader, imageLoader, {
    camera,
    tilesManager: tileManager,
    controlsManager,
    getLoadingSnapshot: () => loadingSnapshot,
  });

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

    const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
    const zoomLevel = disatanceToZoom(cameraDistanceMeters);

    controlsManager.checkAltitude(cameraDistanceMeters);

    const visibleTileKeys = getVisibleTiles(camera, zoomLevel, EARTH_RADIUS);
    tileManager.setNodes(visibleTileKeys);
  };

  controlsManager.onModeChange = (from: ControlMode, to: ControlMode) => {
    console.log(`[Controls] Mode change: ${from} → ${to}`);
    if (to === "fly" || to === "groundOrbit") {
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

  const getCurrentCameraLatlng = () => {
    const pos = camera.position;
    return sphereToLatlng(pos.x, pos.y, pos.z);
  };

  const getLowAltitudeViewPoint = async (at: LatLng, alt: number = null) => {
    const tile12 = latlngToTilekey(at.lng, at.lat, FOCUS_TILE_ZOOM);

    const altitude = alt === null ? await fetchTileAvgAltitude(tile12) : alt;

    const point = latlngToSphere(at.lat, at.lng, EARTH_RADIUS + altitude);

    return new THREE.Vector3(point.x, point.y, point.z);
  };

  const fetchTileAvgAltitude = async (_tile: SphereTileKey) => {
    return 0;
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
      groundOrbitState.azimuthDeg,
      groundOrbitState.altitudeDeg,
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
      groundOrbitState.azimuthDeg,
      groundOrbitState.altitudeDeg,
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
    tileManager.frozen = true;

    const { centerTile, coreFocusTiles } = getFocusNeighborTiles(centerLatlng);

    tileManager.setNodes(coreFocusTiles);

    reconcileAttachedNodeMaterials();

    try {
      await waitForAttachedTiles({
        targetKeys: coreFocusTiles,
        getAttachedKeys: () =>
          tileManager.getAttachedNodes().map((node) => node.key),
      });
    } catch (error) {
      console.warn("[Tiles] Focused tile preload timed out", error);
    }

    const camDistance = zoomToDistance(getFocusZoomLevel());
    const moveCamTo = camera.position.clone();
    moveCamTo.normalize().setLength(EARTH_RADIUS + camDistance);
    camera.position.copy(moveCamTo);

    groundOrbitState.enabled = true;
    await applyGroundOrbitPlacement(centerLatlng);

    return { centerTile, focusTiles: coreFocusTiles };
  };

  guiHandle = attachExploreGui({
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
