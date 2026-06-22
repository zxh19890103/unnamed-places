import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { EARTH_RADIUS, latlngToSphere } from "../calc/sphere";
import { Sphere } from "./Sphere.class";
import { disatanceToZoom } from "../calc/mercator";
import { TilesManager } from "./lod";
import { getVisibleTiles } from "./visibleTiles";
import { ControlsManager, type ControlMode } from "./ControlsManager.class";
import { FlySatelliteCompositor } from "./FlySatelliteCompositor.class";
import { attachExploreGui, type ExploreGuiHandle } from "./gui";
import {
  MAX_DEM_ZOOM,
  START_CENTER_LAT,
  START_CENTER_LON,
} from "../calc/constants";

const GROUND_ORBIT_DISTANCE_METERS = 1_000;

function getLocalBasisAtPoint(target: THREE.Vector3) {
  const up = target.clone().normalize();
  const worldNorth = new THREE.Vector3(0, 1, 0);
  let east = worldNorth.clone().cross(up);

  if (east.lengthSq() < 1e-10) {
    east = new THREE.Vector3(1, 0, 0).cross(up);
  }

  east.normalize();
  const north = up.clone().cross(east).normalize();
  return { up, east, north };
}

function computeOrbitPositionFromAzimuthAltitude(
  target: THREE.Vector3,
  azimuthDeg: number,
  altitudeDeg: number,
  distanceMeters: number,
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

  return target.clone().addScaledVector(viewDirection, distanceMeters);
}

export function createScene(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    100,
    EARTH_RADIUS * 2,
  );

  const startCameraPosition = latlngToSphere(
    START_CENTER_LAT,
    START_CENTER_LON,
    EARTH_RADIUS * 1.5,
  );
  camera.position.set(
    startCameraPosition.x,
    startCameraPosition.y,
    startCameraPosition.z,
  );
  camera.lookAt(0, 0, 0);

  const textureLoader = new THREE.TextureLoader(new THREE.LoadingManager());

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, true);
  container.appendChild(renderer.domElement);

  const stats = new Stats();
  stats.dom.style.position = "absolute";
  stats.dom.style.top = "0";
  stats.dom.style.left = "0";
  container.appendChild(stats.dom);

  const controlsManager = new ControlsManager({
    camera,
    domElement: renderer.domElement,
    renderer,
  });

  const groundOrbitState = {
    enabled: false,
    azimuthDeg: 0,
    altitudeDeg: 30,
  };

  let tileModeLazy = true; // false when fly mode is active (resolution mode)

  const compositor = new FlySatelliteCompositor(textureLoader);

  controlsManager.onModeChange = (from: ControlMode, to: ControlMode) => {
    console.log(`[Controls] Mode change: ${from} → ${to}`);
    if (to === "fly" || to === "groundOrbit") {
      tileModeLazy = false;
      const modeLabel = to === "fly" ? "fly compositor" : "ground orbit";
      console.log(`[Tiles] Entering resolution mode (${modeLabel})`);
    } else {
      tileModeLazy = true;
      compositor.disposeComposedTextures();
      console.log("[Tiles] Entering lazy mode (visibleTiles.ts)");
      refreshVisibleTilesAndStats();
    }
  };

  // Wire pointer controls change event
  controlsManager.getPointerControls().onChange = () => {
    refreshVisibleTilesAndStats();
  };

  const sphereGlobal = new Sphere(textureLoader);
  scene.add(sphereGlobal);
  const tileManager = new TilesManager();

  const terrainState = {
    demEnabled: false,
  };
  let guiHandle: ExploreGuiHandle | null = null;

  const applyDemModeToAttachedTiles = (enabled: boolean) => {
    for (const node of tileManager.getAttachedNodes()) {
      node.tile?.setDemMaterialEnabled(enabled);
    }
  };

  const applyDemMode = (requested: boolean, zoomLevel: number) => {
    if (requested && zoomLevel > MAX_DEM_ZOOM) {
      terrainState.demEnabled = false;
      console.warn(
        `[Terrain] DEM material is disabled above z=${MAX_DEM_ZOOM} (current z=${zoomLevel})`,
      );
      applyDemModeToAttachedTiles(false);
      return;
    }

    terrainState.demEnabled = requested;
    applyDemModeToAttachedTiles(terrainState.demEnabled);
  };

  tileManager.onTileCreate = (node) => {
    const tile = sphereGlobal.createTileByKey(node.key);
    tile.$tNode = node;
    tile.setDemMaterialEnabled(terrainState.demEnabled);
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
      node.tile = undefined;
    }
  };

  const refreshVisibleTilesAndStats = () => {
    const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
    const zoomLevel = disatanceToZoom(cameraDistanceMeters);
    camera.updateMatrixWorld(true);

    if (terrainState.demEnabled && zoomLevel > MAX_DEM_ZOOM) {
      applyDemMode(false, zoomLevel);
      guiHandle?.syncTerrainState();
    }

    // Check altitude-based control switching
    controlsManager.checkAltitude(cameraDistanceMeters);

    // Only update visible tiles if not in fly mode (lazy mode)
    if (tileModeLazy) {
      const visibleTileKeys = getVisibleTiles(camera, zoomLevel, EARTH_RADIUS);
      console.log("visibleTileKeys = ", visibleTileKeys.length);
      tileManager.setNodes(visibleTileKeys);
    } else {
      // In fly mode, tile updates are handled by the compositor (Phase 5)
    }

    sphereGlobal.dispatchStats({
      cameraDistanceMeters,
      zoomLevel,
      visibleTilesCount: tileManager.getVisibleCount?.() ?? 0,
      controlMode: controlsManager.mode,
    });
  };

  const getGroundCenter = () => {
    const center = camera.position
      .clone()
      .normalize()
      .multiplyScalar(EARTH_RADIUS);
    return center;
  };

  const applyGroundOrbitPlacement = () => {
    const center = getGroundCenter();
    const orbitPosition = computeOrbitPositionFromAzimuthAltitude(
      center,
      groundOrbitState.azimuthDeg,
      groundOrbitState.altitudeDeg,
      GROUND_ORBIT_DISTANCE_METERS,
    );

    controlsManager.enterGroundOrbit(center, orbitPosition);
    refreshVisibleTilesAndStats();
  };

  const enterGroundOrbit = (azimuthDeg: number, altitudeDeg: number) => {
    groundOrbitState.azimuthDeg = azimuthDeg;
    groundOrbitState.altitudeDeg = altitudeDeg;
    groundOrbitState.enabled = true;
    applyGroundOrbitPlacement();
  };

  const randomizeGroundOrbitAngles = () => {
    const azimuthDeg = Math.random() * 360;
    const altitudeDeg = 10 + Math.random() * 65;
    enterGroundOrbit(azimuthDeg, altitudeDeg);
  };

  const setGroundOrbitEnabled = (enabled: boolean) => {
    if (enabled) {
      if (!controlsManager.isGroundOrbitMode()) {
        randomizeGroundOrbitAngles();
      }
      return;
    }

    groundOrbitState.enabled = false;
    controlsManager.exitGroundOrbit();
    refreshVisibleTilesAndStats();
  };

  guiHandle = attachExploreGui({
    camera,
    controlsManager,
    onRefreshVisibleTilesAndStats: refreshVisibleTilesAndStats,
    getDemEnabled: () => terrainState.demEnabled,
    applyDemMode,
    getGroundOrbitEnabled: () => groundOrbitState.enabled,
    setGroundOrbitEnabled,
    onRandomizeGroundOrbit: randomizeGroundOrbitAngles,
    getGroundOrbitAngles: () => ({
      azimuthDeg: groundOrbitState.azimuthDeg,
      altitudeDeg: groundOrbitState.altitudeDeg,
    }),
  });

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, true);
  };

  const destroyCameraGui = () => guiHandle?.destroy();
  const destroyStats = () => {
    if (stats.dom.parentElement === container) {
      container.removeChild(stats.dom);
    }
  };

  refreshVisibleTilesAndStats();

  return {
    scene,
    camera,
    renderer,
    controlsManager,
    sphere: sphereGlobal,
    stats,
    tileManager,
    compositor,
    resize,
    destroyCameraGui,
    destroyStats,
    cleanup: () => {
      compositor.dispose();
      controlsManager.dispose();
    },
  };
}
