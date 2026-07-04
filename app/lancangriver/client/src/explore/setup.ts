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
import {
  disatanceToZoom,
  latlngToTilekey,
  mergeTileExtents,
  tileExtent,
  zoomToDistance,
} from "../calc/mercator";
import { TilesManager } from "./TilesManager.class";
import { getVisibleTiles } from "./visibleTiles";
import { ControlsManager, type ControlMode } from "./ControlsManager.class";
import { LowAltitudeTileCompositor } from "./LowAltitudeTileCompositor.class";
import { attachExploreGui, type ExploreGuiHandle } from "./gui";
import { TileMaterialMode } from "./SphereTile.class";
import {
  BASE_URL,
  MAX_DEM_ZOOM,
  START_CENTER_LAT,
  START_CENTER_LON,
} from "../calc/constants";
import { getDateForLocalTimeAtLatLng } from "../calc/timezone";
import { LatLng, SphereTileKey } from "../calc/types";
import { CloudGeometry } from "./geometries/CloudGeometry.class";
import { CloudMaterial } from "./materials/CloudMaterial.class";
import { JourneyDayNode, PhotoRecord } from "../photos/types";
import { PhotoMarkerGeometry } from "./geometries/PhotoMarkerGeometry.class";
import { PhotoMarkerMaterial } from "./materials/PhotoMarkerMaterial.class";
import { OsmBuildingTilesController } from "./OsmBuildingTilesController.class";

const SKY_DISTANCE = EARTH_RADIUS * 8;
const SKY_COLOR = new THREE.Color("#ffffff");
const FOG_COLOR = new THREE.Color("#ffffff");
const SKY_SCALE_MULTIPLIER = 8;
const SKY_MIN_SCALE = EARTH_RADIUS * 1.5;
const SKY_MAX_SCALE = EARTH_RADIUS * 12;
const FOCUS_TILE_ZOOM = 11;
const FOCUS_TILE_EXTENT = {
  x0: -2,
  y0: -1,
  x1: 2,
  y1: 1,
};
const FOCUS_TILE_HALO: readonly [number, number] = [1, 1];
const FOCUS_TILE_WAIT_TIMEOUT_MS = 5_000;

type FocusTileRole = "core" | "halo";

type FocusTileWithRole = {
  key: SphereTileKey;
  role: FocusTileRole;
};

const tileKeyId = (key: SphereTileKey): string => `${key.z}/${key.x}/${key.y}`;

const appendTileIfAbsent = (
  result: SphereTileKey[],
  seen: Set<string>,
  tile: SphereTileKey,
) => {
  const id = tileKeyId(tile);
  if (seen.has(id)) {
    return;
  }

  seen.add(id);
  result.push(tile);
};

const collectTilesInExtent = (
  centerKey: SphereTileKey,
  extent: { x0: number; x1: number; y0: number; y1: number },
) => {
  const n = 2 ** FOCUS_TILE_ZOOM;
  const seen = new Set<string>();
  const result: SphereTileKey[] = [];

  for (let dy = extent.y0; dy <= extent.y1; dy += 1) {
    for (let dx = extent.x0; dx <= extent.x1; dx += 1) {
      const wrappedX = (((centerKey.x + dx) % n) + n) % n;
      const clampedY = Math.max(0, Math.min(n - 1, centerKey.y + dy));

      appendTileIfAbsent(result, seen, {
        z: FOCUS_TILE_ZOOM,
        x: wrappedX,
        y: clampedY,
      });
    }
  }

  return result;
};

const splitCoreAndHaloTiles = (
  coreFocusTiles: SphereTileKey[],
  expandedTiles: SphereTileKey[],
) => {
  const coreIds = new Set(coreFocusTiles.map(tileKeyId));
  const haloTiles = expandedTiles.filter((tile) => !coreIds.has(tileKeyId(tile)));
  const focusTilesWithRole: FocusTileWithRole[] = [
    ...coreFocusTiles.map((key) => ({ key, role: "core" as const })),
    ...haloTiles.map((key) => ({ key, role: "halo" as const })),
  ];

  return {
    coreFocusTiles,
    haloTiles,
    focusTilesWithRole,
    focusTiles: [...coreFocusTiles, ...haloTiles],
  };
};

export const buildFocusNeighbors = (
  centerLatlng: LatLng,
  halo: readonly [number, number],
) => {
  const centerTile = latlngToTilekey(
    centerLatlng.lng,
    centerLatlng.lat,
    FOCUS_TILE_ZOOM,
  );

  const [haloX, haloY] = halo;

  const coreFocusTiles = collectTilesInExtent(centerTile, FOCUS_TILE_EXTENT);
  const expandedFocusTiles = collectTilesInExtent(centerTile, {
    x0: FOCUS_TILE_EXTENT.x0 - haloX,
    x1: FOCUS_TILE_EXTENT.x1 + haloX,
    y0: FOCUS_TILE_EXTENT.y0 - haloY,
    y1: FOCUS_TILE_EXTENT.y1 + haloY,
  });

  return {
    centerTile,
    ...splitCoreAndHaloTiles(coreFocusTiles, expandedFocusTiles),
  };
};

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
  // const latlngExpr = `25.0389,102.7183`;
  const latlngExpr = `40.746,14.498`;
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
  skyUniforms.rayleigh.value = 0.2;
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

  const groundOrbitState = {
    enabled: false,
    azimuthDeg: 180,
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

  const terrainState = {
    materialMode: TileMaterialMode.Basic,
    demEnabled: false, // Keep for backwards compatibility
  };

  let groundOrbitClouds: THREE.Points<CloudGeometry, CloudMaterial> | null =
    null;
  let guiHandle: ExploreGuiHandle | null = null;

  const applyMaterialModeToAttachedTiles = (mode: TileMaterialMode) => {
    for (const node of tileManager.getAttachedNodes()) {
      if (node.focusRole === "halo") {
        continue;
      }

      if (node.tile) {
        node.tile.setMaterialMode(mode);
      }
    }
  };

  const applyMaterialMode = (
    requested: TileMaterialMode,
    zoomLevel: number,
  ) => {
    // Block DEM modes if zoom is too high
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
    terrainState.demEnabled = requested !== TileMaterialMode.Basic;
    applyMaterialModeToAttachedTiles(requested);
    return true;
  };

  tileManager.onTileCreate = (node) => {
    const tile = sphereGlobal.createTileByKey(node.key);
    tile.$tNode = node;
    if (node.focusRole === "halo") {
      tile.setEmptyMaterial();
    } else {
      tile.setMaterialMode(terrainState.materialMode);
    }
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

  /**
   * I have no idea of this?
   */
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

    // Check altitude-based control switching
    controlsManager.checkAltitude(cameraDistanceMeters);

    // Only update visible tiles when not frozen (fly / groundOrbit freeze tile finding)
    if (!tileManager.frozen) {
      const visibleTileKeys = getVisibleTiles(camera, zoomLevel, EARTH_RADIUS);
      tileManager.setNodes(visibleTileKeys);
      return;
    }
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

  const fetchTileAvgAltitude = async (tile: SphereTileKey) => {
    const json = await fetch(
      `${BASE_URL}/raster/dem/${tile.z}/${tile.x}/${tile.y}/altitude`,
    ).then((r) => r.json());
    return (json?.max ?? 0) + 5_000;
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

  const applyGroundOrbitPlacement = async (targetLatlng?: LatLng) => {
    const orbitLatlng = targetLatlng ?? getCurrentCameraLatlng();
    const orbitTarget = await getLowAltitudeViewPoint(orbitLatlng, 5_000);

    const cameraDistanceMeters =
      2.5 * (camera.position.length() - EARTH_RADIUS);

    syncSkyWithCamera(orbitTarget, cameraDistanceMeters);

    const orbitPosition = computeOrbitPositionFromAzimuthAltitude(
      orbitTarget,
      groundOrbitState.azimuthDeg,
      groundOrbitState.altitudeDeg,
      cameraDistanceMeters,
    );

    clearGroundOrbitClouds();

    const cloudRadius = 10 * cameraDistanceMeters;

    const cloudGeometry = new CloudGeometry({
      latlng: orbitLatlng,
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
    groundOrbitClouds.position.copy(orbitTarget);

    scene.add(groundOrbitClouds);

    controlsManager.enterGroundOrbit(orbitTarget, orbitPosition);
    refreshVisibleTiles();

    const newOrbitTarget = await getLowAltitudeViewPoint(orbitLatlng);
    syncSkyWithCamera(newOrbitTarget, cameraDistanceMeters);
    const newOrbitPosition = computeOrbitPositionFromAzimuthAltitude(
      newOrbitTarget,
      groundOrbitState.azimuthDeg,
      groundOrbitState.altitudeDeg,
      cameraDistanceMeters,
    );
    groundOrbitClouds.position.copy(newOrbitTarget);
    controlsManager.enterGroundOrbit(newOrbitTarget, newOrbitPosition);
  };

  const keyId = tileKeyId;

  const getFocusNeighborTiles = (
    centerLatlng: LatLng,
  ): {
    centerTile: SphereTileKey;
    coreFocusTiles: SphereTileKey[];
    haloTiles: SphereTileKey[];
    focusTilesWithRole: FocusTileWithRole[];
    focusTiles: SphereTileKey[];
  } => {
    return buildFocusNeighbors(centerLatlng, FOCUS_TILE_HALO);
  };

  const waitForAttachedTiles = async (
    targetKeys: SphereTileKey[],
    timeoutMs = FOCUS_TILE_WAIT_TIMEOUT_MS,
  ) => {
    const target = new Set(targetKeys.map(keyId));
    const start = performance.now();

    await new Promise<void>((resolve, reject) => {
      const check = () => {
        const attached = tileManager.getAttachedNodes();
        const attachedIds = new Set(attached.map((node) => keyId(node.key)));
        const ready = [...target].every((id) => attachedIds.has(id));

        if (ready) {
          resolve();
          return;
        }

        if (performance.now() - start > timeoutMs) {
          reject(new Error("Timed out waiting for focused tiles to attach"));
          return;
        }

        window.requestAnimationFrame(check);
      };

      check();
    });
  };

  const focusGroundOrbitAtLatLng = async (centerLatlng: LatLng) => {
    // Freeze immediately to disable interaction-driven tile loading.
    tileManager.frozen = true;

    const { focusTiles, centerTile, focusTilesWithRole } =
      getFocusNeighborTiles(centerLatlng);
    tileManager.setNodes(
      focusTilesWithRole.map(({ key, role }) => ({
        ...key,
        focusRole: role,
      })),
    );

    try {
      await waitForAttachedTiles(focusTiles);
    } catch (error) {
      console.warn("[Tiles] Focused tile preload timed out", error);
    }

    const camDistance = zoomToDistance(FOCUS_TILE_ZOOM);
    const moveCamTo = camera.position.clone();
    moveCamTo.normalize().setLength(EARTH_RADIUS + camDistance);
    camera.position.copy(moveCamTo);

    groundOrbitState.enabled = true;
    await applyGroundOrbitPlacement(centerLatlng);

    return { centerTile, focusTiles };
  };

  guiHandle = attachExploreGui({
    camera,
    controlsManager,
    onRefreshVisibleTilesAndStats: refreshVisibleTiles,
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

  let showPhotosLocationsDispose: VoidFunction = null;
  const showPhotosLocations = (
    journeyDay: JourneyDayNode,
    records: PhotoRecord[],
    tiles: SphereTileKey[],
    centerTile: SphereTileKey,
  ) => {
    showPhotosLocationsDispose?.();

    const group = new THREE.Group();
    const photos: THREE.Mesh<PhotoMarkerGeometry, PhotoMarkerMaterial>[] = [];

    const worldExtent = mergeTileExtents(
      ...tiles.map((tile) => tileExtent(tile.z, tile.x, tile.y)),
    );

    const waterDropTexture = textureLoader.load("/waterdrop.svg");
    const worldDemTexture = textureLoader.load(
      `${BASE_URL}/raster/dem/${centerTile.z}/${centerTile.x}/${centerTile.y}/compose.png`,
    );

    journeyDay.photoIds.forEach((id) => {
      const photoRec = records.find((rec) => rec.id === id);
      if (!photoRec) {
        return;
      }

      const photo = new THREE.Mesh(
        new PhotoMarkerGeometry({
          rec: photoRec,
          size: 800,
          ratio: 1,
          worldExtent: worldExtent,
        }),

        new PhotoMarkerMaterial(textureLoader, {
          map: waterDropTexture,
          rec: photoRec,
          worldDemTexture: worldDemTexture,
          worldExtent: worldExtent,
        }),
      );

      group.add(photo);
      photos.push(photo);
    });

    scene.add(group);

    showPhotosLocationsDispose = () => {
      scene.remove(group);

      for (const photo of photos) {
        photo.geometry.dispose();
        photo.material.dispose();
      }

      waterDropTexture.dispose();
      worldDemTexture.dispose();

      showPhotosLocationsDispose = null;
    };
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
    getCurrentCenterLatLng: getCurrentCameraLatlng,
    focusGroundOrbitAtLatLng,
    destroyCameraGui,
    destroyStats,
    showPhotosLocations,
    cleanup: () => {
      clearGroundOrbitClouds();
      osmBuildingTiles.dispose();

      sphereGlobal.dispose();
      compositor.dispose();
      controlsManager.dispose();
    },
  };
}
