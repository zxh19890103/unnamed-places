import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { EARTH_RADIUS, BASE_URL } from '@/calc/constants.js';
import { Sphere } from '../Sphere.class.js';
import { TilesManager } from '../TilesManager.class.js';
import { ControlsManager } from '../ControlsManager.class.js';
import { TileMaterialMode } from '../SphereTile.class.js';
import { LatLng } from '@/calc/types.js';
import { createVendors } from './vendors.js';
import { createSkyRig, FOG_COLOR, getDefaultCenterLatlng } from './sky.js';
import { createGroundOrbitCloudsController } from './clouds.js';
import { createPhotoLocationsPresenter } from './photos.js';
import { create3dTilesViewer, latlngToSphere, sphereToLatlng } from '@/_3dtiles';
import { computeVisibleGroundBBox, type LatLngBBox } from './coverageVisibility.js';

export let globalTileMaterialMode: TileMaterialMode = TileMaterialMode.Basic;

export const setGlobalTileMaterialMode = (value: TileMaterialMode) => {
  globalTileMaterialMode = value;
};

const alwaysReturns12Func = () => 12;

export let getZoomLevel = alwaysReturns12Func;

export function createSceneState(container: HTMLElement) {
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

  const threeTilesViewer = create3dTilesViewer({
    camera,
    baseDistance: 32_000_000,
    maxZoom: 20,
  });

  getZoomLevel = () => threeTilesViewer.getLookAtZoom();

  const defualtLookAtLatlng = getDefaultCenterLatlng();

  const startCameraPosition = latlngToSphere(
    defualtLookAtLatlng.lat,
    defualtLookAtLatlng.lng,
    EARTH_RADIUS + 1_602_964,
  );

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

  const getCurrentCameraLatlng = () => {
    const pos = camera.position;
    return sphereToLatlng(pos.x, pos.y, pos.z);
  };

  const getCurrentGroundCenterLatLng = () => {
    const target = camera.position;
    return sphereToLatlng(target.x, target.y, target.z);
  };

  const setVisibleTilesElevationRange = (minMeters: number, maxMeters: number) => {
    // camera.position.y += maxMeters;
    // controlsManager.orbitControls.update();
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

    skyRig.createEarthSurfaceSky(centerLatlng);

    const cameraDistanceMeters = Math.max(1, camera.position.length() - EARTH_RADIUS);

    cloudsController.syncCloudsAtTarget({
      latlng: centerLatlng,
      orbitTarget: controlsManager.orbitControls.target.clone(),
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

  const controlsManager = new ControlsManager({
    threeTilesViewer,
    camera,
    domElement: renderer.domElement,
    renderer,
  });

  const sphereGlobal = new Sphere(threeTilesViewer, textureLoader, imageLoader, {
    camera,
    tilesManager: tilesManager,
    controlsManager,
    getLoadingSnapshot: () => loadingSnapshot,
  });

  scene.add(sphereGlobal);

  controlsManager.pointerControls.onChange = () => {
    refreshVisibleTilesOnCameraChanges();
  };

  controlsManager.orbitControls.addEventListener('end', () => {
    reconcileAttachedNodeMaterials();
    refreshVisibleTilesOnCameraChanges();
  });

  threeTilesViewer.useOrbitControls(controlsManager.orbitControls);

  refreshVisibleTilesOnCameraChanges();

  // @ts-expect-error
  threeTilesViewer.addEventListener('change:lookAt', (event) => {
    console.log(event);
  });

  return {
    scene,
    camera,
    renderer,
    controlsManager,
    sphere: sphereGlobal,
    stats,
    tileManager: tilesManager,
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
    },
    cleanup: () => {
      getZoomLevel = alwaysReturns12Func;

      cloudsController.dispose();
      skyRig.dispose();

      photoLocationsPresenter.dispose();
      sphereGlobal.dispose();
      controlsManager.dispose();
      threeTilesViewer.dispose();
      destroyStats();
      renderer.dispose();
    },
  };
}

export type SceneState = ReturnType<typeof createSceneState>;
