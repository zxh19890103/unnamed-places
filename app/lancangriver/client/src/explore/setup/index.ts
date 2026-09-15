import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { EARTH_RADIUS, BASE_URL } from '@/calc/constants.js';
import { Sphere } from '../Sphere.class.js';
import { TilesManager, TilesManagerMode } from '../TilesManager.class.js';
import { TileMaterialMode } from '../SphereTile.class.js';
import { createVendors } from './vendors.js';
import { createSkyRig, FOG_COLOR, getDefaultCenterLatlng } from './sky.js';
import { createGroundOrbitCloudsController } from './clouds.js';
import { createPhotoLocationsPresenter } from './photos.js';
import { EarthTile, initialize3DTilesViewer, latlngToSphere } from '@/_3dtiles';
import { ExploreControls } from '../controls/ExploreControls.class';

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

  const earthFallback = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 0.5, 120),
    new THREE.MeshBasicMaterial({
      map: textureLoader.load(`/dcrbmun-38493001-d0cc-4bd6-9acb-2bf1109b488b.jpg`),
      wireframe: false,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: true,
      side: THREE.FrontSide,
    }),
  );

  earthFallback.visible = false;
  earthFallback.renderOrder = 2;
  earthFallback.frustumCulled = false;

  scene.add(earthFallback);

  const camera = new THREE.PerspectiveCamera(
    75,
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
    baseDistance: 46_188_000,
    maxZoom: 21,
    minDistance: 300,
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

    const viewPosition = camera.position.clone();

    let earthTiles: EarthTile[];

    if (tilesManager.mode === 'dynamic') {
      earthTiles = threeTilesViewer.getVisibleTiles(viewPosition);
    } else {
      earthTiles = threeTilesViewer.getAllTiles(tilesManager.staticZoom);
    }

    tilesManager.setNodes(earthTiles);
  };

  const setTilesMgrMode = (mode: TilesManagerMode) => {
    tilesManager.mode = mode;
    refreshVisibleTilesOnCameraChanges();
  };

  const setVisibleTilesElevationRange = (minMeters: number, maxMeters: number) => {
    threeTilesViewer.setElevation(minMeters, maxMeters);
    exploreControls.setElevation(minMeters, maxMeters);

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

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
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

  const exploreControls = new ExploreControls(camera, renderer.domElement, {
    baseDistance: 46_188_000,
    maxZoom: 21,
    minDistance: 300,
  });

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

  refreshVisibleTilesOnCameraChanges();

  return {
    scene,
    camera,
    renderer,
    controls: exploreControls,
    sphere: sphereGlobal,
    stats,
    tileManager: tilesManager,
    threeTilesViewer,
    resize,
    reconcileAttachedNodeMaterials,
    refreshVisibleTilesOnCameraChanges,
    setVisibleTilesElevationRange,
    setTilesMgrMode,
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
