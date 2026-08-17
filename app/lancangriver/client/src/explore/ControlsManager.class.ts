import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FlyControls } from "three/examples/jsm/controls/FlyControls.js";
import { FLY_MOVEMENT_SPEED, FLY_ROLL_SPEED } from "../calc/constants";
import { EARTH_RADIUS } from "../calc/sphere";
import { PointerControls } from "./controls/PointerControls.class";
import { Create3dTilesViewer } from "../experiments/sphere-zoom/viewer";

export type ControlMode = "none" | "pointer" | "orbit" | "fly";

export interface ControlsManagerOptions {
  threeTilesViewer: Create3dTilesViewer;
  camera: THREE.Camera;
  domElement: HTMLElement;
  renderer?: THREE.WebGLRenderer;
  enabled?: boolean;
}

export class ControlsManager {
  private camera: THREE.Camera;
  private threeTilesViewer: Create3dTilesViewer;

  public readonly orbitControls: OrbitControls;
  public readonly flyControls: FlyControls;
  public readonly pointerControls: PointerControls;

  private _enabled: boolean;
  private _mode: ControlMode = "orbit";
  private _tweenInProgress: boolean = false;

  onModeChange?: (from: ControlMode, to: ControlMode) => void;

  constructor(options: ControlsManagerOptions) {
    const { camera, domElement, threeTilesViewer, enabled = true } = options;
    this.camera = camera;
    this.threeTilesViewer = threeTilesViewer;

    this._enabled = enabled;

    this.orbitControls = new OrbitControls(camera, domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.enablePan = false;
    this.orbitControls.enableZoom = true;
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.minDistance = EARTH_RADIUS + 100;
    this.orbitControls.maxDistance = EARTH_RADIUS * 2;
    this.orbitControls.enabled = false;

    this.flyControls = new FlyControls(camera, domElement);
    this.flyControls.movementSpeed = FLY_MOVEMENT_SPEED;
    this.flyControls.rollSpeed = FLY_ROLL_SPEED;
    this.flyControls.dragToLook = true;
    this.flyControls.enabled = false;

    this.pointerControls = new PointerControls(
      threeTilesViewer,
      camera,
      domElement,
      {
        enabled: false,
      },
    );

    this.applyEnabledState();
  }

  /**
   * Returns the currently active control mode.
   */
  get mode(): ControlMode {
    return this._mode;
  }

  /**
   * Returns whether the controls manager is actively driving controls.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Enable fly mode directly, bypassing altitude gating.
   * Intended for GUI/tooling use. To disable, call disableFly().
   */
  forceFly(): void {
    if (!this._enabled) {
      return;
    }

    if (this._mode === "fly") {
      return;
    }

    this.switchMode("fly");
  }

  /**
   * Enable fly mode (user-triggered). Only valid when altitude < A2.
   */
  enterFly(): void {
    if (!this._enabled) {
      return;
    }

    if (this._mode === "fly") {
      return; // Already in fly mode
    }

    this.switchMode("fly");
  }

  /**
   * Disable fly mode (user-triggered or auto-triggered on altitude rise).
   * Returns to map mode.
   */
  exitFly(): void {
    if (!this._enabled) {
      return;
    }

    if (this._mode !== "fly") {
      return; // Not in fly mode
    }

    this.switchMode("orbit");
  }

  /**
   * Update the active control. Call this in the render loop with delta time.
   */
  update(delta: number): void {
    if (!this._enabled || this._tweenInProgress) {
      return; // Pause input during transition tween
    }

    switch (this._mode) {
      case "none":
        break;
      case "orbit":
        this.orbitControls.update(delta);
        break;
      case "pointer":
        // Event-driven, no per-frame update
        break;
      case "fly":
        this.flyControls.update(delta);
        break;
    }
  }

  /**
   * Switch control mode with a smooth transition.
   */
  private switchMode(newMode: ControlMode): void {
    if (newMode === this._mode) {
      return;
    }

    const oldMode = this._mode;
    const cameraPosition = this.camera.position.clone();
    const cameraQuaternion = this.camera.quaternion.clone();
    const cameraUp = this.camera.up.clone();

    const handoffTarget = this.getHandoffTarget(oldMode);

    // Disable old control
    this.setControlEnabled(oldMode, false);

    // Enable new control
    this._mode = newMode;
    this.applyEnabledState();

    // Keep camera pose stable and sync target-like state for orbit/map controls.
    this.camera.position.copy(cameraPosition);
    this.camera.quaternion.copy(cameraQuaternion);
    this.camera.up.copy(cameraUp);
    this.camera.updateMatrixWorld(true);

    this.applyHandoffTarget(newMode, handoffTarget);

    // Emit callback
    if (this._enabled) {
      this.onModeChange?.(oldMode, newMode);
    }
  }

  private getHandoffTarget(mode: ControlMode): THREE.Vector3 {
    if (mode === "orbit") {
      return this.orbitControls.target.clone();
    }

    return new THREE.Vector3(0, 0, 0);
  }

  private applyHandoffTarget(mode: ControlMode, target: THREE.Vector3): void {
    if (mode === "orbit") {
      this.orbitControls.target.set(0, 0, 0);
      this.camera.lookAt(this.orbitControls.target);
      this.camera.updateMatrixWorld(true);
      this.orbitControls.update();
      return;
    }
  }

  private applyEnabledState(): void {
    if (!this._enabled || this._mode === "none") {
      this.setControlEnabled("orbit", false);
      this.setControlEnabled("pointer", false);
      this.setControlEnabled("fly", false);
      return;
    }

    this.setControlEnabled("orbit", this._mode === "orbit");
    this.setControlEnabled("pointer", this._mode === "pointer");
    this.setControlEnabled("fly", this._mode === "fly");
  }

  /**
   * Enable or disable a specific control.
   */
  private setControlEnabled(mode: ControlMode, enabled: boolean): void {
    switch (mode) {
      case "none":
        break;
      case "orbit":
        this.orbitControls.enabled = enabled;
        break;
      case "pointer":
        this.pointerControls.enabled = enabled;
        break;
      case "fly":
        this.flyControls.enabled = enabled;
        break;
    }
  }

  /**
   * Dispose all controls (call on scene cleanup).
   */
  dispose(): void {
    this.orbitControls.dispose();
    this.flyControls.dispose();
    this.pointerControls.dispose();
  }

  /**
   * Get pointer controls for event wiring.
   */
  getPointerControls(): PointerControls {
    return this.pointerControls;
  }

  getOrbitControls(): OrbitControls {
    return this.orbitControls;
  }

  /**
   * Check if fly mode is currently active.
   */
  isFlyMode(): boolean {
    return this._mode === "fly";
  }
}
