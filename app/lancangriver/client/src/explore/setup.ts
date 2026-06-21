import * as THREE from "three";
import { GUI } from "lil-gui";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { EARTH_RADIUS, latlngToSphere, sphereToLatlng } from "../calc/sphere";
import { Sphere } from "./Sphere.class";
import { getZoomLvFromDistance, zoomToDistance } from "../calc/mercator";
import { TilesManager } from "./lod";
import { getVisibleTiles } from "./visibleTiles";
import { ControlsManager, type ControlMode } from "./ControlsManager.class";
import { FlySatelliteCompositor } from "./FlySatelliteCompositor.class";

const GUI_ZOOM_MIN = 1;
const GUI_ZOOM_MAX = 19;
const GUI_ZOOM_STEP = 1;
const REFERENCE_DISTANCE_METERS = 100;

export function createScene(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    100,
    EARTH_RADIUS * 2,
  );

  camera.position.set(0, 0, EARTH_RADIUS * 1.5);
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

  let tileModeLazy = true; // false when fly mode is active (resolution mode)

  const compositor = new FlySatelliteCompositor(textureLoader);

  controlsManager.onModeChange = (from: ControlMode, to: ControlMode) => {
    console.log(`[Controls] Mode change: ${from} → ${to}`);
    if (to === "fly") {
      tileModeLazy = false;
      console.log("[Tiles] Entering resolution mode (fly compositor)");
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

  tileManager.onTileCreate = (node) => {
    const tile = sphereGlobal.createTileByKey(node.key);
    tile.$tNode = node;
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
    const zoomLevel = getZoomLvFromDistance(cameraDistanceMeters);
    camera.updateMatrixWorld(true);

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

  const gui = new GUI({ title: "Explore Camera" });
  const cameraFolder = gui.addFolder("Camera");
  const navigationFolder = gui.addFolder("Navigation");

  cameraFolder
    .add(camera, "fov", 20, 120, 1)
    .name("fov")
    .onChange(() => camera.updateProjectionMatrix());

  const applyZoomLevel = (zoomLevel: number) => {
    const z = THREE.MathUtils.clamp(
      Math.round(zoomLevel),
      GUI_ZOOM_MIN,
      GUI_ZOOM_MAX,
    );

    zoomState.zoomLevel = z;

    const altitude = zoomToDistance(z, GUI_ZOOM_MIN, GUI_ZOOM_MAX);
    const nextRadius = EARTH_RADIUS + altitude;
    camera.position.normalize().multiplyScalar(nextRadius);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    refreshVisibleTilesAndStats();
  };

  const syncGeoFromCamera = () => {
    const latlng = sphereToLatlng(
      camera.position.x,
      camera.position.y,
      camera.position.z,
    );

    geoState.lat = Number(latlng.lat.toFixed(6));
    geoState.lng = Number(latlng.lng.toFixed(6));
  };

  const zoomState = {
    zoomLevel: getZoomLvFromDistance(
      Math.max(1, camera.position.length() - EARTH_RADIUS),
      GUI_ZOOM_MIN,
      GUI_ZOOM_MAX,
    ),
    zoomIn: () => applyZoomLevel(zoomState.zoomLevel + GUI_ZOOM_STEP),
    zoomOut: () => applyZoomLevel(zoomState.zoomLevel - GUI_ZOOM_STEP),
  };

  const geoState = {
    lat: 0,
    lng: 0,
    go: () => {
      const lat = THREE.MathUtils.clamp(geoState.lat, -85, 85);
      const lng = ((((geoState.lng + 180) % 360) + 360) % 360) - 180;
      geoState.lat = lat;
      geoState.lng = lng;

      const altitude = Math.max(1, camera.position.length() - EARTH_RADIUS);
      const next = latlngToSphere(lat, lng, EARTH_RADIUS + altitude);
      camera.position.set(next.x, next.y, next.z);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);

      zoomState.zoomLevel = getZoomLvFromDistance(
        altitude,
        GUI_ZOOM_MIN,
        GUI_ZOOM_MAX,
      );

      refreshVisibleTilesAndStats();
    },
  };

  const syncNavigationStateFromCamera = () => {
    syncGeoFromCamera();
    zoomState.zoomLevel = getZoomLvFromDistance(
      Math.max(1, camera.position.length() - EARTH_RADIUS),
      GUI_ZOOM_MIN,
      GUI_ZOOM_MAX,
    );
  };

  const rotateCameraPosition = (
    axis: THREE.Vector3,
    deltaRad: number,
    clampLatitude = false,
  ) => {
    camera.position.applyAxisAngle(axis, deltaRad);

    if (clampLatitude) {
      const altitude = Math.max(1, camera.position.length() - EARTH_RADIUS);
      const latlng = sphereToLatlng(
        camera.position.x,
        camera.position.y,
        camera.position.z,
      );
      const clampedLat = THREE.MathUtils.clamp(latlng.lat, -85, 85);
      const clamped = latlngToSphere(
        clampedLat,
        latlng.lng,
        EARTH_RADIUS + altitude,
      );
      camera.position.set(clamped.x, clamped.y, clamped.z);
    }

    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    syncNavigationStateFromCamera();
    refreshVisibleTilesAndStats();
  };

  const altitudeState = {
    stepMeters: 100,
    increaseAltitude: () => {
      const step = Math.max(1, altitudeState.stepMeters);
      const currentAltitude = Math.max(
        1,
        camera.position.length() - EARTH_RADIUS,
      );
      const nextRadius = EARTH_RADIUS + currentAltitude + step;

      camera.position.normalize().multiplyScalar(nextRadius);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      syncNavigationStateFromCamera();
    },
    decreaseAltitude: () => {
      const step = Math.max(1, altitudeState.stepMeters);
      const currentAltitude = Math.max(
        1,
        camera.position.length() - EARTH_RADIUS,
      );
      const nextAltitude = Math.max(1, currentAltitude - step);
      const nextRadius = EARTH_RADIUS + nextAltitude;

      camera.position.normalize().multiplyScalar(nextRadius);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      syncNavigationStateFromCamera();
    },
  };

  const rotationState = {
    deltaDeg: 15,
    rotatePositiveY: () => {
      const deltaRad = THREE.MathUtils.degToRad(rotationState.deltaDeg);
      rotateCameraPosition(new THREE.Vector3(0, 1, 0), deltaRad);
    },
    rotateNegativeY: () => {
      const deltaRad = THREE.MathUtils.degToRad(-rotationState.deltaDeg);
      rotateCameraPosition(new THREE.Vector3(0, 1, 0), deltaRad);
    },
    rotateUp: () => {
      const forward = camera.position.clone().normalize().negate();
      const right = forward.cross(new THREE.Vector3(0, 1, 0)).normalize();
      const axis = right.lengthSq() > 0 ? right : new THREE.Vector3(1, 0, 0);
      const deltaRad = THREE.MathUtils.degToRad(rotationState.deltaDeg);
      rotateCameraPosition(axis, deltaRad, true);
    },
    rotateDown: () => {
      const forward = camera.position.clone().normalize().negate();
      const right = forward.cross(new THREE.Vector3(0, 1, 0)).normalize();
      const axis = right.lengthSq() > 0 ? right : new THREE.Vector3(1, 0, 0);
      const deltaRad = THREE.MathUtils.degToRad(-rotationState.deltaDeg);
      rotateCameraPosition(axis, deltaRad, true);
    },
  };

  syncGeoFromCamera();

  navigationFolder
    .add(zoomState, "zoomLevel", GUI_ZOOM_MIN, GUI_ZOOM_MAX, GUI_ZOOM_STEP)
    .name("zoom")
    .onChange((value: number) => applyZoomLevel(value));
  navigationFolder.add(zoomState, "zoomIn").name("zoom +");
  navigationFolder.add(zoomState, "zoomOut").name("zoom -");
  navigationFolder.add(geoState, "lat", -85, 85, 0.000001).name("lat");
  navigationFolder.add(geoState, "lng", -180, 180, 0.000001).name("lng");
  navigationFolder.add(geoState, "go").name("GO");
  navigationFolder.add(rotationState, "deltaDeg", 1, 180, 1).name("rotate Δ");
  navigationFolder.add(rotationState, "rotatePositiveY").name("rotate +Y");
  navigationFolder.add(rotationState, "rotateNegativeY").name("rotate -Y");
  navigationFolder.add(rotationState, "rotateUp").name("rotate up");
  navigationFolder.add(rotationState, "rotateDown").name("rotate down");
  navigationFolder
    .add(altitudeState, "stepMeters", 1, 100000, 1)
    .name("alt step (m)");
  navigationFolder.add(altitudeState, "increaseAltitude").name("alt +");
  navigationFolder.add(altitudeState, "decreaseAltitude").name("alt -");

  const flyControlsState = {
    toggle: () => {
      if (controlsManager.isFlyMode()) {
        controlsManager.disableFly();
      } else {
        controlsManager.forceFly();
      }
    },
  };

  cameraFolder.add(flyControlsState, "toggle").name("fly controls on/off");

  cameraFolder.open();
  navigationFolder.open();

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, true);
  };

  const destroyCameraGui = () => gui.destroy();
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
