import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import {
  EARTH_RADIUS,
  getLocalBasisAtPoint,
  latlngToSphere,
  sphereToLatlng,
} from "../../calc/sphere";
import {
  disatanceToZoom,
  latlngToTilekey,
  mergeTileExtents,
  tileExtent,
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
import { JourneyDayNode, PhotoRecord } from "../../photos/types";
import { PhotoMarkerGeometry } from "../geometries/PhotoMarkerGeometry.class";
import { PhotoMarkerMaterial } from "../materials/PhotoMarkerMaterial.class";
import { OsmBuildingTilesController } from "../OsmBuildingTilesController.class";
import { createVendors } from "./vendors";
import { createSkyRig, FOG_COLOR, SKY_COLOR } from "./sky";
import { createGroundOrbitCloudsController } from "./clouds";
import { GroundOrbitState } from "./types";

const FOCUS_TILE_ZOOM = 11;
const FOCUS_TILE_EXTENT = {
  x0: -0,
  y0: -0,
  x1: 0,
  y1: 0,
};

const FOCUS_TILE_WAIT_TIMEOUT_MS = 5_000;

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

const buildFocusNeighbors = (centerLatlng: LatLng) => {
  const centerTile = latlngToTilekey(
    centerLatlng.lng,
    centerLatlng.lat,
    FOCUS_TILE_ZOOM,
  );

  const coreFocusTiles = collectTilesInExtent(centerTile, FOCUS_TILE_EXTENT);

  return {
    centerTile,
    coreFocusTiles,
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

  const keyId = tileKeyId;

  const getFocusNeighborTiles = (
    centerLatlng: LatLng,
  ): {
    centerTile: SphereTileKey;
    coreFocusTiles: SphereTileKey[];
  } => {
    return buildFocusNeighbors(centerLatlng);
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
    tileManager.frozen = true;

    const { centerTile, coreFocusTiles } = getFocusNeighborTiles(centerLatlng);

    tileManager.setNodes(coreFocusTiles);

    reconcileAttachedNodeMaterials();

    try {
      await waitForAttachedTiles(coreFocusTiles);
    } catch (error) {
      console.warn("[Tiles] Focused tile preload timed out", error);
    }

    const camDistance = zoomToDistance(FOCUS_TILE_ZOOM);
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
    showPhotosLocations,
    cleanup: () => {
      cloudsController.dispose();
      osmBuildingTiles.dispose();
      sphereGlobal.dispose();
      controlsManager.dispose();
    },
  };
}
