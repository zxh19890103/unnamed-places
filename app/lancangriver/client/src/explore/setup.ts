import * as THREE from "three";
import * as SunCalc from "suncalc";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import {
  EARTH_RADIUS,
  getLocalBasisAtPoint,
  latlngToSphere,
  sphereToLatlng,
} from "../calc/sphere";
import { Sphere } from "./Sphere.class";
import { disatanceToZoom, tileBounds4326 } from "../calc/mercator";
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
import { getDateForLocalTimeAtLatLng } from "../calc/timezone";
import { LatLng, SphereTileKey } from "../calc/types";
import { CloudGeometry } from "./geometries/CloudGeometry.class";
import { CloudMaterial } from "./materials/CloudMaterial.class";

const SKY_DISTANCE = EARTH_RADIUS * 8;
const SKY_COLOR = new THREE.Color("#b9d9ff");
const FOG_COLOR = new THREE.Color("#c7dcf5");
const SKY_SCALE_MULTIPLIER = 8;
const SKY_MIN_SCALE = EARTH_RADIUS * 1.5;
const SKY_MAX_SCALE = EARTH_RADIUS * 12;

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

function computeSunDirectionForLocation(
  date: Date,
  latitude: number,
  longitude: number,
) {
  const observerSurfacePointRaw = latlngToSphere(
    latitude,
    longitude,
    EARTH_RADIUS,
  );
  const observerSurfacePoint = new THREE.Vector3(
    observerSurfacePointRaw.x,
    observerSurfacePointRaw.y,
    observerSurfacePointRaw.z,
  );
  const { up, east, north } = getLocalBasisAtPoint(observerSurfacePoint);
  const { azimuth, altitude } = SunCalc.getPosition(date, latitude, longitude);
  const azimuthRad = THREE.MathUtils.degToRad(azimuth);
  const altitudeRad = THREE.MathUtils.degToRad(altitude);

  // SunCalc v2: azimuth is clockwise from north, and altitude is above horizon.
  const horizontal = north
    .clone()
    .multiplyScalar(Math.cos(azimuthRad))
    .add(east.clone().multiplyScalar(Math.sin(azimuthRad)));

  return horizontal
    .multiplyScalar(Math.cos(altitudeRad))
    .add(up.multiplyScalar(Math.sin(altitudeRad)))
    .normalize();
}

function getDefaultCenterLatlng(): LatLng {
  const latlngExpr = `25.0389,102.7183`;
  const [lat, lng] = latlngExpr.split(",").map((seg) => Number(seg));

  return {
    lat: lat ?? START_CENTER_LAT,
    lng: lng ?? START_CENTER_LON,
  };
}

function getLatlngNow(latlng: LatLng) {
  const localTime = `07:32`;
  return getDateForLocalTimeAtLatLng(latlng, localTime);
}

export function createScene(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = SKY_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.000015);

  const sky = new Sky();
  sky.scale.setScalar(SKY_DISTANCE);
  scene.add(sky);

  const initialCenter = getDefaultCenterLatlng();

  const sunDirection = computeSunDirectionForLocation(
    getLatlngNow(initialCenter),
    initialCenter.lat,
    initialCenter.lng,
  );

  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 0.01;
  skyUniforms.rayleigh.value = 0.1;
  skyUniforms.mieCoefficient.value = 0.00015;
  skyUniforms.mieDirectionalG.value = 0.05;
  skyUniforms.sunPosition.value.copy(sunDirection);
  skyUniforms.up.value.set(0, 1, 0);

  // const ambientLight = new THREE.HemisphereLight("#d9ecff", "#93a36a", 1.3);
  // scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight("#fff2d6", 0.45);
  sunLight.position.copy(sunDirection).multiplyScalar(SKY_DISTANCE * 0.25);
  scene.add(sunLight);

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
  const cloudAtlasTexture = textureLoader.load("/clouds_in-one.png");
  cloudAtlasTexture.wrapS = THREE.ClampToEdgeWrapping;
  cloudAtlasTexture.wrapT = THREE.ClampToEdgeWrapping;
  cloudAtlasTexture.magFilter = THREE.LinearFilter;
  cloudAtlasTexture.minFilter = THREE.LinearMipmapLinearFilter;

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

  let groundOrbitClouds: THREE.Points<CloudGeometry, CloudMaterial> | null =
    null;
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

  const syncSkyWithCamera = (
    orbitCenter: THREE.Vector3,
    cameraDistanceMeters: number,
  ) => {
    const scale = THREE.MathUtils.clamp(
      cameraDistanceMeters * SKY_SCALE_MULTIPLIER,
      SKY_MIN_SCALE,
      SKY_MAX_SCALE,
    );

    sky.scale.setScalar(scale);
    sky.position.copy(orbitCenter);
    sky.rotation.set(0, 0, 0);

    const latlng = sphereToLatlng(orbitCenter.x, orbitCenter.y, orbitCenter.z);

    console.log("location:", latlng.lat, latlng.lng);

    const sunDirection = computeSunDirectionForLocation(
      getLatlngNow(latlng),
      latlng.lat,
      latlng.lng,
    );

    skyUniforms.sunPosition.value.copy(sunDirection);
    skyUniforms.up.value.copy(orbitCenter).normalize();
  };

  const refreshVisibleTiles = () => {
    const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
    const zoomLevel = disatanceToZoom(cameraDistanceMeters);
    camera.updateMatrixWorld(true);

    if (terrainState.demEnabled && zoomLevel > MAX_DEM_ZOOM) {
      applyDemMode(false, zoomLevel);
      guiHandle?.syncTerrainState();
    }

    // Check altitude-based control switching
    controlsManager.checkAltitude(cameraDistanceMeters);

    // Only update visible tiles when not frozen (fly / groundOrbit freeze tile finding)
    if (!tileManager.frozen) {
      const visibleTileKeys = getVisibleTiles(camera, zoomLevel, EARTH_RADIUS);
      tileManager.setNodes(visibleTileKeys);
      return;
    }
  };

  const getGroundLookAtPoint = async () => {
    const altitude = await fetchTileAvgAltitude(null);

    const center = camera.position
      .clone()
      .normalize()
      .multiplyScalar(EARTH_RADIUS + altitude);

    return center;
  };

  const fetchTileAvgAltitude = async (tile: SphereTileKey) => {
    return 3200;
  };

  const clearGroundOrbitClouds = () => {
    if (!groundOrbitClouds) {
      return;
    }

    scene.remove(groundOrbitClouds);
    groundOrbitClouds.geometry.dispose();
    groundOrbitClouds.material.dispose();
    groundOrbitClouds = null;
  };

  const applyGroundOrbitPlacement = async () => {
    const center = await getGroundLookAtPoint();

    const centerLatlng = sphereToLatlng(center.x, center.y, center.z);

    const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;

    syncSkyWithCamera(center, cameraDistanceMeters);

    const orbitPosition = computeOrbitPositionFromAzimuthAltitude(
      center,
      180,
      45,
      cameraDistanceMeters,
    );

    clearGroundOrbitClouds();

    const cloudRadius = 10 * cameraDistanceMeters;

    const cloudGeometry = new CloudGeometry({
      latlng: centerLatlng,
      radius: cloudRadius,
      count: 100,
      maxAltitudeDeg: 1,
      bandWidth: 0,
    });
    const cloudMaterial = new CloudMaterial({
      color: "#ffffff",
      size: 600,
      opacity: 0.55,
      softness: 0.6,
      sizeAttenuation: false,
      viewportHeight: container.clientHeight,
      atlasTexture: cloudAtlasTexture,
      atlasGrid: 4,
    });
    groundOrbitClouds = new THREE.Points(cloudGeometry, cloudMaterial);
    groundOrbitClouds.position.copy(center);

    scene.add(groundOrbitClouds);

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
    clearGroundOrbitClouds();
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

    if (groundOrbitClouds) {
      groundOrbitClouds.material.uniforms.uViewportHeight.value = Math.max(
        1,
        height,
      );
    }
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
      clearGroundOrbitClouds();
      sphereGlobal.dispose();
      compositor.dispose();
      controlsManager.dispose();
    },
  };
}
