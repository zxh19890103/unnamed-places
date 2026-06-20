import * as THREE from "three";
import { GUI } from "lil-gui";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { EARTH_RADIUS, latlngToSphere } from "../calc/sphere";
import { Sphere } from "./Sphere.class";
import { getZoomLvFromDistance } from "../calc/mercator";
import { TilesManager } from "./lod";
import { getVisibleTiles } from "./visibleTiles";

export function createScene(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    1000,
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  controls.minDistance = EARTH_RADIUS + 1_000;
  controls.maxDistance = EARTH_RADIUS * 3;

  controls.rotateSpeed = 0.1;
  controls.zoomSpeed = 0.1;

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

  const computeVisibleTileKeys = () => {
    const distance = camera.position.length() - EARTH_RADIUS;
    const zoom = getZoomLvFromDistance(distance);
    camera.updateMatrixWorld();
    return getVisibleTiles(camera, zoom, EARTH_RADIUS);
  };

  const refreshVisibleTilesAndStats = () => {
    const visibleTileKeys = computeVisibleTileKeys();
    console.log("visibleTileKeys = ", visibleTileKeys.length);
    const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
    const zoomLevel = getZoomLvFromDistance(cameraDistanceMeters);

    tileManager.setNodes(visibleTileKeys);

    sphereGlobal.dispatchStats({
      cameraDistanceMeters,
      zoomLevel,
      visibleTilesCount: visibleTileKeys.length,
    });
  };

  const gui = new GUI({ title: "Explore Camera" });
  const cameraFolder = gui.addFolder("Camera");
  cameraFolder
    .add(camera, "fov", 20, 120, 1)
    .name("fov")
    .onChange(() => camera.updateProjectionMatrix());

  const controlsFolder = gui.addFolder("Orbit Controls");
  controlsFolder.add(controls, "enableDamping").name("enableDamping");
  controlsFolder
    .add(controls, "dampingFactor", 0.01, 0.2, 0.005)
    .name("damping");
  controlsFolder.add(controls, "autoRotate").name("autoRotate");

  const geolocationState = {
    lat: 31.135516,
    lon: 97.176581,
  };

  const geolocationFolder = gui.addFolder("Geolocation");
  geolocationFolder.add(geolocationState, "lat", -90, 90, 0.0001).name("lat");
  geolocationFolder.add(geolocationState, "lon", -180, 180, 0.0001).name("lon");

  const geolocationActions = {
    go: () => {
      const lat = Math.max(-90, Math.min(90, geolocationState.lat));
      const lon = Math.max(-180, Math.min(180, geolocationState.lon));
      const distanceFromCenter = EARTH_RADIUS + 1_000;
      const nextPosition = latlngToSphere(lat, lon, distanceFromCenter);

      controls.minDistance = Math.min(controls.minDistance, distanceFromCenter);
      controls.target.set(0, 0, 0);
      camera.position.set(nextPosition.x, nextPosition.y, nextPosition.z);
      camera.lookAt(0, 0, 0);
      controls.update();
      refreshVisibleTilesAndStats();
    },
    add: () => {
      refreshVisibleTilesAndStats();
    },
  };

  geolocationFolder.add(geolocationActions, "go").name("Go");
  geolocationFolder.add(geolocationActions, "add").name("Add");

  cameraFolder.open();
  controlsFolder.close();
  geolocationFolder.close();

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

  controls.addEventListener("end", (event) => {
    refreshVisibleTilesAndStats();
  });

  return {
    scene,
    camera,
    renderer,
    controls,
    sphere: sphereGlobal,
    stats,
    resize,
    destroyCameraGui,
    destroyStats,
  };
}
