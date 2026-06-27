import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import { EARTH_RADIUS, latlngToSphere } from "../calc/sphere";
import { Sphere } from "./Sphere.class";
import { disatanceToZoom } from "../calc/mercator";
import { TilesManager } from "./TilesManager.class";
import { getVisibleTiles } from "./visibleTiles";
import { ControlsManager, type ControlMode } from "./ControlsManager.class";
import { LowAltitudeTileCompositor } from "./LowAltitudeTileCompositor.class";
import { attachExploreGui, type ExploreGuiHandle } from "./gui";
import {
  MAX_DEM_ZOOM,
  START_CENTER_LAT,
  START_CENTER_LON,
} from "../calc/constants";

const SKY_DISTANCE = EARTH_RADIUS * 8;
const SKY_COLOR = new THREE.Color("#b9d9ff");
const FOG_COLOR = new THREE.Color("#c9e2ff");
const SKY_SCALE_MULTIPLIER = 8;
const SKY_MIN_SCALE = EARTH_RADIUS * 1.5;
const SKY_MAX_SCALE = EARTH_RADIUS * 12;

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
  scene.background = SKY_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.000012);

  const sky = new Sky();
  sky.scale.setScalar(SKY_DISTANCE);
  scene.add(sky);

  const sunDirection = new THREE.Vector3(0.35, 0.2, -1).normalize();
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 2;
  skyUniforms.rayleigh.value = 1;
  skyUniforms.mieCoefficient.value = 0.005;
  skyUniforms.mieDirectionalG.value = 0.8;
  skyUniforms.sunPosition.value.copy(sunDirection);
  skyUniforms.up.value.set(0, 1, 0);

  // const ambientLight = new THREE.HemisphereLight("#d9ecff", "#93a36a", 1.3);
  // scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight("#fff2d6", 2.2);
  sunLight.position.copy(sunDirection).multiplyScalar(SKY_DISTANCE * 0.25);
  scene.add(sunLight);

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

  const loadingManager = new THREE.LoadingManager();
  const loadingSnapshot = {
    loaded: 0,
    total: 0,
    active: false,
    errors: 0,
    lastErrorUrl: null as string | null,
  };

  loadingManager.onStart = (_url, loaded, total) => {
    loadingSnapshot.active = true;
    loadingSnapshot.loaded = loaded;
    loadingSnapshot.total = total;
  };
  loadingManager.onProgress = (_url, loaded, total) => {
    loadingSnapshot.active = true;
    loadingSnapshot.loaded = loaded;
    loadingSnapshot.total = total;
  };
  loadingManager.onLoad = () => {
    loadingSnapshot.active = false;
  };
  loadingManager.onError = (url) => {
    loadingSnapshot.active = true;
    loadingSnapshot.errors += 1;
    loadingSnapshot.lastErrorUrl = url;
  };

  const textureLoader = new THREE.TextureLoader(loadingManager);
  const imageLoader = new THREE.ImageLoader(loadingManager);

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

  const compositor = new LowAltitudeTileCompositor(textureLoader, imageLoader);

  controlsManager.onModeChange = (from: ControlMode, to: ControlMode) => {
    console.log(`[Controls] Mode change: ${from} → ${to}`);
    if (to === "fly" || to === "groundOrbit") {
      tileManager.frozen = true;
      const modeLabel = to === "fly" ? "fly compositor" : "ground orbit";
      console.log(`[Tiles] Entering resolution mode (${modeLabel})`);
    } else {
      tileManager.frozen = false;
      compositor.disposeComposedTextures();
      console.log("[Tiles] Tile finding resumed");
      refreshVisibleTiles();
    }
  };

  // Wire pointer controls change event
  controlsManager.getPointerControls().onChange = () => {
    refreshVisibleTiles();
  };

  const tileManager = new TilesManager();

  const sphereGlobal = new Sphere(textureLoader, imageLoader, {
    camera,
    tilesManager: tileManager,
    controlsManager,
    getLoadingSnapshot: () => loadingSnapshot,
  });

  scene.add(sphereGlobal);

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

  const syncSkyWithCamera = (cameraDistanceMeters: number) => {
    const scale = THREE.MathUtils.clamp(
      cameraDistanceMeters * SKY_SCALE_MULTIPLIER,
      SKY_MIN_SCALE,
      SKY_MAX_SCALE,
    );

    sky.scale.setScalar(scale);
    sky.position.copy(camera.position);
    sky.rotation.set(0, 0, 0);

    const cameraLengthSq = camera.position.lengthSq();
    if (cameraLengthSq > 1e-6) {
      skyUniforms.up.value.copy(camera.position).normalize();
    } else {
      skyUniforms.up.value.set(0, 1, 0);
    }
  };

  const refreshVisibleTiles = () => {
    const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
    const zoomLevel = disatanceToZoom(cameraDistanceMeters);
    camera.updateMatrixWorld(true);
    syncSkyWithCamera(cameraDistanceMeters);

    if (terrainState.demEnabled && zoomLevel > MAX_DEM_ZOOM) {
      applyDemMode(false, zoomLevel);
      guiHandle?.syncTerrainState();
    }

    // Check altitude-based control switching
    controlsManager.checkAltitude(cameraDistanceMeters);

    // Only update visible tiles when not frozen (fly / groundOrbit freeze tile finding)
    if (!tileManager.frozen) {
      const visibleTileKeys = getVisibleTiles(camera, zoomLevel, EARTH_RADIUS);
      console.log("visibleTileKeys = ", visibleTileKeys.length);
      tileManager.setNodes(visibleTileKeys);
    }
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

    const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
    syncSkyWithCamera(cameraDistanceMeters);

    const orbitPosition = computeOrbitPositionFromAzimuthAltitude(
      center,
      180,
      45,
      cameraDistanceMeters,
    );

    controlsManager.enterGroundOrbit(center, orbitPosition);
    refreshVisibleTiles();
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
    refreshVisibleTiles();
  };

  guiHandle = attachExploreGui({
    camera,
    controlsManager,
    onRefreshVisibleTilesAndStats: refreshVisibleTiles,
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

  refreshVisibleTiles();

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
      sphereGlobal.dispose();
      compositor.dispose();
      controlsManager.dispose();
    },
  };
}
