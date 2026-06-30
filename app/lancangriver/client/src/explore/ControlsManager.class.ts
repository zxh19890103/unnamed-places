import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FlyControls } from "three/examples/jsm/controls/FlyControls.js";
import { FLY_MOVEMENT_SPEED, FLY_ROLL_SPEED } from "../calc/constants";
import { EARTH_RADIUS } from "../calc/sphere";
import { PointerControls } from "./controls/PointerControls.class";

export type ControlMode = "none" | "pointer" | "groundOrbit" | "fly";

export interface ControlsManagerOptions {
  camera: THREE.Camera;
  domElement: HTMLElement;
  renderer?: THREE.WebGLRenderer;
  enabled?: boolean;
}

export class ControlsManager {
  private camera: THREE.Camera;

  private groundOrbitControls: OrbitControls;
  private flyControls: FlyControls;
  private pointerControls: PointerControls;

  private _enabled: boolean;
  private _mode: ControlMode = "pointer";
  private _lastAltitude: number = 0;
  private _tweenInProgress: boolean = false;
  private _lastMapTuneAltitude: number | null = null;

  private readonly lowAltitude = 30_000;

  onModeChange?: (from: ControlMode, to: ControlMode) => void;

  constructor(options: ControlsManagerOptions) {
    const { camera, domElement, enabled = true } = options;
    this.camera = camera;
    this._enabled = enabled;

    this.groundOrbitControls = new OrbitControls(camera, domElement);
    this.groundOrbitControls.enableDamping = true;
    this.groundOrbitControls.enablePan = true;
    this.groundOrbitControls.enableZoom = true;

    this.groundOrbitControls.minAzimuthAngle = -Math.PI;
    this.groundOrbitControls.maxAzimuthAngle = Math.PI;

    this.groundOrbitControls.rotateSpeed = 0.25;
    this.groundOrbitControls.zoomSpeed = 1;
    this.groundOrbitControls.enabled = false;

    this.flyControls = new FlyControls(camera, domElement);
    this.flyControls.movementSpeed = FLY_MOVEMENT_SPEED;
    this.flyControls.rollSpeed = FLY_ROLL_SPEED;
    this.flyControls.dragToLook = true;
    this.flyControls.enabled = false;

    this.pointerControls = new PointerControls(camera, domElement, {
      enabled: false,
    });

    this.pointerControls.onChange = () => {
      // Pointer controls dispatch changes internally
    };

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
   * Check altitude and auto-switch between orbit and map.
   * Fly mode is never auto-switched; it must be user-triggered.
   */
  checkAltitude(altitudeMeters: number): void {
    if (!this._enabled) {
      return;
    }

    this._lastAltitude = altitudeMeters;
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

  enterGroundOrbit(target: THREE.Vector3, position: THREE.Vector3): void {
    if (!this._enabled) {
      return;
    }

    this.switchMode("groundOrbit");
    this.groundOrbitControls.target.copy(target);
    this.camera.position.copy(position);

    const up =
      target.lengthSq() > 0
        ? target.clone().normalize()
        : position.clone().normalize();
    if (up.lengthSq() > 0) {
      this.camera.up.copy(up);
    }

    this.camera.lookAt(target);
    this.camera.updateMatrixWorld(true);
    this.groundOrbitControls.update();
  }

  exitGroundOrbit(): void {
    if (!this._enabled || this._mode !== "groundOrbit") {
      return;
    }

    this.switchMode("pointer");
  }

  /**
   * Enable fly mode (user-triggered). Only valid when altitude < A2.
   */
  enterFly(): void {
    if (!this._enabled) {
      return;
    }

    if (this._lastAltitude > this.lowAltitude) {
      console.warn(
        `Cannot enable fly mode at altitude ${this._lastAltitude}m (above A2=${this.lowAltitude}m)`,
      );
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

    this.switchMode("pointer");
  }

  /**
   * Update the active control. Call this in the render loop with delta time.
   */
  update(delta: number): void {
    if (!this._enabled || this._tweenInProgress) {
      return; // Pause input during transition tween
    }

    // Keep altitude fresh even while controls are actively moving.
    this._lastAltitude = this.camera.position.length() - EARTH_RADIUS;

    switch (this._mode) {
      case "none":
        break;
      case "pointer":
        // Event-driven, no per-frame update
        break;
      case "groundOrbit":
        this.groundOrbitControls.update(delta);
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
    return new THREE.Vector3(0, 0, 0);
  }

  private applyHandoffTarget(mode: ControlMode, target: THREE.Vector3): void {}

  private applyEnabledState(): void {
    if (!this._enabled || this._mode === "none") {
      this.setControlEnabled("pointer", false);
      this.setControlEnabled("groundOrbit", false);
      this.setControlEnabled("fly", false);
      return;
    }

    this.setControlEnabled("pointer", this._mode === "pointer");
    this.setControlEnabled("groundOrbit", this._mode === "groundOrbit");
    this.setControlEnabled("fly", this._mode === "fly");
  }

  /**
   * Enable or disable a specific control.
   */
  private setControlEnabled(mode: ControlMode, enabled: boolean): void {
    switch (mode) {
      case "none":
        break;
      case "pointer":
        this.pointerControls.enabled = enabled;
        break;
      case "groundOrbit":
        this.groundOrbitControls.enabled = enabled;
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
    this.groundOrbitControls.dispose();
    this.flyControls.dispose();
    this.pointerControls.dispose();
  }

  /**
   * Get pointer controls for event wiring.
   */
  getPointerControls(): PointerControls {
    return this.pointerControls;
  }

  /**
   * Check if fly mode is currently active.
   */
  isFlyMode(): boolean {
    return this._mode === "fly";
  }

  isGroundOrbitMode(): boolean {
    return this._mode === "groundOrbit";
  }
}
