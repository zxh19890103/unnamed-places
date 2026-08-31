import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { EARTH_RADIUS, BASE_URL } from '@/calc/constants.js';
import { Sphere } from '../Sphere.class.js';
import { TilesManager } from '../TilesManager.class.js';
import { TileMaterialMode } from '../SphereTile.class.js';
import { LatLng } from '@/calc/types.js';
import { createVendors } from './vendors.js';
import { createSkyRig, FOG_COLOR, getDefaultCenterLatlng } from './sky.js';
import { createGroundOrbitCloudsController } from './clouds.js';
import { createPhotoLocationsPresenter } from './photos.js';
import { initialize3DTilesViewer, latlngToSphere } from '@/_3dtiles';
import { ExploreControls } from '../controls/ExploreControls.class.js';

export let globalTileMaterialMode: TileMaterialMode = TileMaterialMode.Basic;

export const setGlobalTileMaterialMode = (value: TileMaterialMode) => {
  globalTileMaterialMode = value;
};

function createSceneState(container: HTMLElement) {
  const { loadingSnapshot, textureLoader, imageLoader, cloudAtlasTexture } = createVendors();

  const scene = new THREE.Scene();
  scene.background = textureLoader.load('/Euclid_Deep_Field_South_16x_zoom_pillars.jpg');
  scene.background.colorSpace = THREE.SRGBColorSpace;
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0);

  const camera = new THREE.PerspectiveCamera(
    120,
    container.clientWidth / container.clientHeight,
    100,
    EARTH_RADIUS * 2,
  );

  const skyRig = createSkyRig({
    scene,
    camera,
  });

  const threeTilesViewer = initialize3DTilesViewer({
    camera,
    baseDistance: 32_000_000,
    maxZoom: 20,
  });

  const tilesManager = new TilesManager();

  tilesManager.onTileCreate = (node) => {
    const tile = sphereGlobal.createTileByKey(node.key);
    // add uniforms before it is added;
    // threeTilesViewer.state.elevation.mi
    tile.applyMaterialUniforms({
      minElevationMeters: threeTilesViewer.state.elevation.min,
      maxElevationMeters: threeTilesViewer.state.elevation.max,
    });

    tile.$node = node;

    tile.setMaterialMode(globalTileMaterialMode);
    node.tile = tile;
  };

  tilesManager.onTileAttach = (node) => {
    if (node.tile) {
      sphereGlobal.attachTile(node.tile);
    }
  };

  tilesManager.onTileDetach = (node) => {
    if (node.tile) {
      sphereGlobal.detachTile(node.tile);
    }
  };

  tilesManager.onTileDispose = (node) => {
    if (node.tile) {
      sphereGlobal.disposeTile(node.tile);
      node.tile = null;
    }
  };

  const reconcileAttachedNodeMaterials = () => {
    for (const node of tilesManager.getAttachedNodes()) {
      if (!node.tile) {
        continue;
      }

      node.tile.setMaterialMode(globalTileMaterialMode);
    }
  };

  const refreshVisibleTilesOnCameraChanges = () => {
    if (tilesManager.frozen) return;

    const earthTiles = threeTilesViewer.getVisibleTiles(camera.position.clone());

    tilesManager.setNodes(earthTiles);
  };

  const setVisibleTilesElevationRange = (minMeters: number, maxMeters: number) => {
    threeTilesViewer.setElevationRange(minMeters, maxMeters);
    refreshVisibleTilesOnCameraChanges();
  };

  const focusGroundOrbitAtLatLng = async (centerLatlng: LatLng) => {
    threeTilesViewer.lookAtLatlng(centerLatlng, 5_000);

    skyRig.createEarthSurfaceSky(centerLatlng);

    const cameraDistanceMeters = Math.max(1, camera.position.length() - EARTH_RADIUS);

    cloudsController.syncCloudsAtTarget({
      latlng: centerLatlng,
      orbitTarget: exploreControls.target.clone(),
      cameraDistanceMeters: cameraDistanceMeters,
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
  };

  const destroyStats = () => {
    if (stats.dom.parentElement === container) {
      container.removeChild(stats.dom);
    }
  };

  const defualtLookAtLatlng = getDefaultCenterLatlng();

  const startCameraPosition = latlngToSphere(
    defualtLookAtLatlng.lat,
    defualtLookAtLatlng.lng,
    EARTH_RADIUS + 1_602_964,
  );

  camera.position.set(startCameraPosition.x, startCameraPosition.y, startCameraPosition.z);

  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, true);
  container.appendChild(renderer.domElement);

  const stats = new Stats();
  stats.dom.style.position = 'static';

  const cloudsController = createGroundOrbitCloudsController({
    scene,
    cloudAtlasTexture,
  });

  const photoLocationsPresenter = createPhotoLocationsPresenter({
    scene,
    textureLoader,
    baseUrl: BASE_URL,
  });

  const exploreControls = new ExploreControls(camera, renderer.domElement);

  exploreControls.addEventListener('end', () => {
    reconcileAttachedNodeMaterials();
    refreshVisibleTilesOnCameraChanges();
  });

  const sphereGlobal = new Sphere(threeTilesViewer, textureLoader, imageLoader, {
    camera,
    tilesManager: tilesManager,
    getLoadingSnapshot: () => loadingSnapshot,
  });

  scene.add(sphereGlobal);

  threeTilesViewer.useControls(exploreControls);

  refreshVisibleTilesOnCameraChanges();

  threeTilesViewer.addEventListener('change:lookat', (event) => {
    console.log(event);
  });

  return {
    scene,
    camera,
    renderer,
    controls: exploreControls,
    sphere: sphereGlobal,
    stats,
    tileManager: tilesManager,
    resize,
    reconcileAttachedNodeMaterials,
    refreshVisibleTilesOnCameraChanges,
    setVisibleTilesElevationRange,
    focusGroundOrbitAtLatLng,
    threeTilesViewer,
    onFrame: (frameTimeMs: number) => {
      sphereGlobal.recordFrameTime(frameTimeMs);
    },
    cleanup: () => {
      cloudsController.dispose();
      skyRig.dispose();

      photoLocationsPresenter.dispose();
      sphereGlobal.dispose();
      exploreControls.dispose();
      threeTilesViewer.dispose();
      destroyStats();
      renderer.dispose();

      currentSceneState = null;
    },
  };
}

export function initializeScene({ container }: { container: HTMLElement }) {
  currentSceneState = createSceneState(container);
  return currentSceneState;
}

export type SceneState = ReturnType<typeof createSceneState>;

export let currentSceneState: SceneState = null;
