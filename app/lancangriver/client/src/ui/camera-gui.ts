import { GUI } from "lil-gui";
import type * as THREE from "three";
import type { MapControls } from "three/examples/jsm/controls/MapControls.js";

const FIXED_VIEW_ANGLE = Math.PI / 4;
const TOP_DOWN_VIEW_ANGLE = 0.001;

type CameraViewMode = "oblique45" | "topDown";

type CameraGuiState = {
  viewMode: CameraViewMode;
  targetX: number;
  targetZ: number;
  height: number;
  fov: number;
  near: number;
  far: number;
  dampingFactor: number;
  panSpeed: number;
  zoomSpeed: number;
  minDistance: number;
  maxDistance: number;
};

function createInitialState(
  camera: THREE.PerspectiveCamera,
  controls: MapControls,
): CameraGuiState {
  const viewMode: CameraViewMode =
    controls.minPolarAngle > FIXED_VIEW_ANGLE / 2 ? "oblique45" : "topDown";

  return {
    viewMode,
    targetX: controls.target.x,
    targetZ: controls.target.z,
    height: camera.position.y,
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    dampingFactor: controls.dampingFactor,
    panSpeed: controls.panSpeed,
    zoomSpeed: controls.zoomSpeed,
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
  };
}

export function attachCameraGui(
  camera: THREE.PerspectiveCamera,
  controls: MapControls,
) {
  const gui = new GUI({ title: "Camera" });
  const state = createInitialState(camera, controls);

  const apply = () => {
    state.height = Math.max(50, state.height);
    state.near = Math.max(0.01, Math.min(state.near, state.far - 1));
    state.far = Math.max(state.near + 1, state.far);
    state.minDistance = Math.max(10, state.minDistance);
    state.maxDistance = Math.max(state.minDistance, state.maxDistance);

    const polarAngle =
      state.viewMode === "oblique45" ? FIXED_VIEW_ANGLE : TOP_DOWN_VIEW_ANGLE;
    const zOffset = Math.tan(polarAngle) * state.height;

    camera.position.set(state.targetX, state.height, state.targetZ + zOffset);
    camera.fov = state.fov;
    camera.near = state.near;
    camera.far = state.far;
    camera.lookAt(state.targetX, 0, state.targetZ);
    camera.updateProjectionMatrix();

    controls.target.set(state.targetX, 0, state.targetZ);
    controls.dampingFactor = state.dampingFactor;
    controls.panSpeed = state.panSpeed;
    controls.zoomSpeed = state.zoomSpeed;
    controls.minDistance = state.minDistance;
    controls.maxDistance = state.maxDistance;
    controls.screenSpacePanning = false;
    controls.enableRotate = false;
    controls.minPolarAngle = polarAngle;
    controls.maxPolarAngle = polarAngle;
    controls.update();
  };

  gui
    .add(state, "viewMode", {
      oblique45: "oblique45",
      topDown: "topDown",
    })
    .name("viewMode")
    .onChange(apply);

  const movement = gui.addFolder("Movement");
  movement.add(state, "targetX", -200000, 200000, 10).onChange(apply);
  movement.add(state, "targetZ", -200000, 200000, 10).onChange(apply);
  movement.add(state, "height", 50, 20000, 10).onChange(apply);

  const lens = gui.addFolder("Lens");
  lens.add(state, "fov", 20, 150, 1).onChange(apply);
  lens.add(state, "near", 0.01, 2000, 0.01).onChange(apply);
  lens.add(state, "far", 100, 200000, 10).onChange(apply);

  const controlsFolder = gui.addFolder("Controls");
  controlsFolder.add(state, "dampingFactor", 0, 0.5, 0.001).onChange(apply);
  controlsFolder.add(state, "panSpeed", 0.1, 5, 0.1).onChange(apply);
  controlsFolder.add(state, "zoomSpeed", 0.1, 5, 0.1).onChange(apply);
  controlsFolder.add(state, "minDistance", 10, 50000, 10).onChange(apply);
  controlsFolder.add(state, "maxDistance", 100, 100000, 10).onChange(apply);

  const resetDefaults = {
    reset: () => {
      Object.assign(state, createInitialState(camera, controls));
      apply();
      for (const controller of gui.controllersRecursive()) {
        controller.updateDisplay();
      }
    },
  };
  gui.add(resetDefaults, "reset");

  movement.open();
  lens.close();
  controlsFolder.close();

  apply();

  return () => gui.destroy();
}
