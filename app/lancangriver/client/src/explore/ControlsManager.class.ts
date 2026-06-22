import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { FlyControls } from "three/examples/jsm/controls/FlyControls.js";
import { FLY_MOVEMENT_SPEED, FLY_ROLL_SPEED } from "../calc/constants";
import { EARTH_RADIUS } from "../calc/sphere";
import { PointerControls } from "./controls/PointerControls.class";

export type ControlMode =
  | "none"
  | "pointer"
  | "orbit"
  | "groundOrbit"
  | "map"
  | "fly";

export interface ControlsManagerOptions {
  camera: THREE.Camera;
  domElement: HTMLElement;
  renderer?: THREE.WebGLRenderer;
  enabled?: boolean;
}

export class ControlsManager {
  private camera: THREE.Camera;
  private orbitControls: OrbitControls;
  private groundOrbitControls: OrbitControls;
  private mapControls: MapControls;
  private flyControls: FlyControls;
  private pointerControls: PointerControls;

  private _enabled: boolean;
  private _mode: ControlMode = "pointer";
  private _lastAltitude: number = 0;
  private _tweenInProgress: boolean = false;
  private _lastMapTuneAltitude: number | null = null;

  // Altitude thresholds (meters)
  private readonly A1 = 50_000; // Orbit ↔ Map threshold
  private readonly A2 = 3_000; // Map ↔ Fly threshold

  // Hysteresis bands for orbit ↔ map
  private readonly ORBIT_DESCEND_THRESHOLD = 50_000 - 2_000; // < 48km → map
  private readonly ORBIT_ASCEND_THRESHOLD = 50_000 + 2_000; // > 52km → orbit

  // Map controls tuning by altitude (A2..A1)
  private readonly MAP_PAN_MIN = 0.015;
  private readonly MAP_PAN_MAX = 0.35;
  private readonly MAP_ZOOM_MIN = 0.04;
  private readonly MAP_ZOOM_MAX = 0.22;
  private readonly MAP_TUNE_RESPONSE = 10;
  private readonly MAP_ALTITUDE_DEADBAND = 30;

  onModeChange?: (from: ControlMode, to: ControlMode) => void;

  constructor(options: ControlsManagerOptions) {
    const { camera, domElement, renderer, enabled = true } = options;
    this.camera = camera;
    this._enabled = enabled;

    // Initialize all three controls
    this.orbitControls = new OrbitControls(camera, domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.minDistance = EARTH_RADIUS; // EARTH_RADIUS + A1
    this.orbitControls.maxDistance = EARTH_RADIUS * 3; // EARTH_RADIUS * 3
    this.orbitControls.rotateSpeed = 0.1;
    this.orbitControls.zoomSpeed = 0.1;
    this.orbitControls.enabled = enabled;

    this.groundOrbitControls = new OrbitControls(camera, domElement);
    this.groundOrbitControls.enableDamping = true;
    this.groundOrbitControls.enablePan = true;
    this.groundOrbitControls.enableZoom = true;
    this.groundOrbitControls.rotateSpeed = 0.25;
    this.groundOrbitControls.zoomSpeed = 1;
    this.groundOrbitControls.enabled = false;

    this.mapControls = new MapControls(camera, domElement);
    this.mapControls.enableDamping = true;
    this.mapControls.target.set(0, 0, 0);
    this.mapControls.screenSpacePanning = true;
    this.mapControls.minDistance = EARTH_RADIUS; // EARTH_RADIUS + 100m
    this.mapControls.maxDistance = EARTH_RADIUS + this.ORBIT_ASCEND_THRESHOLD; // EARTH_RADIUS + A1
    this.mapControls.rotateSpeed = 0.1;
    this.mapControls.panSpeed = 0.1;
    this.mapControls.zoomSpeed = 0.1;
    this.mapControls.enabled = false;

    // Clamp polar angle near top-down for map
    this.mapControls.minPolarAngle = 0;
    this.mapControls.maxPolarAngle = Math.PI / 6;

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

    // If in fly mode and altitude rises above A2, auto-exit to map
    if (this._mode === "fly" && altitudeMeters > this.A2) {
      this.disableFly();
      return;
    }

    // Only auto-switch between orbit and map
    if (
      this._mode === "orbit" &&
      altitudeMeters < this.ORBIT_DESCEND_THRESHOLD
    ) {
      this.switchMode("map");
    } else if (
      this._mode === "map" &&
      altitudeMeters > this.ORBIT_ASCEND_THRESHOLD
    ) {
      this.switchMode("orbit");
    }
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
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld(true);
    this.groundOrbitControls.update();
  }

  exitGroundOrbit(): void {
    if (!this._enabled || this._mode !== "groundOrbit") {
      return;
    }

    this.switchMode("map");
  }

  /**
   * Enable fly mode (user-triggered). Only valid when altitude < A2.
   */
  enableFly(): void {
    if (!this._enabled) {
      return;
    }

    if (this._lastAltitude > this.A2) {
      console.warn(
        `Cannot enable fly mode at altitude ${this._lastAltitude}m (above A2=${this.A2}m)`,
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
  disableFly(): void {
    if (!this._enabled) {
      return;
    }

    if (this._mode !== "fly") {
      return; // Not in fly mode
    }

    this.switchMode("map");
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
      case "orbit":
        this.orbitControls.update();
        break;
      case "map":
        this.updateMapInteractionParameters(delta);
        this.mapControls.update();
        break;
      case "groundOrbit":
        this.groundOrbitControls.update();
        break;
      case "fly":
        // Adapt fly movement speed to altitude
        // const speed = Math.max(1, this._lastAltitude / 100);
        // this.flyControls.movementSpeed = speed;
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
    if (mode === "none" || mode === "pointer") {
      return new THREE.Vector3(0, 0, 0);
    }

    if (mode === "orbit") {
      return this.orbitControls.target.clone();
    }

    if (mode === "map") {
      return this.mapControls.target.clone();
    }

    if (mode === "groundOrbit") {
      return this.groundOrbitControls.target.clone();
    }

    // FlyControls has no target; derive one from camera forward ray onto globe.
    const origin = this.camera.position.clone();
    const direction = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();

    const a = direction.dot(direction);
    const b = 2 * origin.dot(direction);
    const c = origin.dot(origin) - EARTH_RADIUS * EARTH_RADIUS;
    const discriminant = b * b - 4 * a * c;

    if (discriminant >= 0) {
      const sqrtD = Math.sqrt(discriminant);
      const t1 = (-b - sqrtD) / (2 * a);
      const t2 = (-b + sqrtD) / (2 * a);
      const t = t1 > 0 ? t1 : t2 > 0 ? t2 : Number.POSITIVE_INFINITY;

      if (Number.isFinite(t)) {
        return origin.addScaledVector(direction, t);
      }
    }

    return new THREE.Vector3(0, 0, 0);
  }

  private applyHandoffTarget(mode: ControlMode, target: THREE.Vector3): void {
    if (mode === "orbit") {
      this.orbitControls.target.copy(target);
      this.orbitControls.update();
      return;
    }

    if (mode === "map") {
      this.mapControls.target.copy(target);
      this.updateMapInteractionParameters(1 / 60, true);
      this.mapControls.update();
      return;
    }

    if (mode === "groundOrbit") {
      this.groundOrbitControls.target.copy(target);
      this.groundOrbitControls.update();
    }
  }

  private updateMapInteractionParameters(
    delta: number,
    immediate = false,
  ): void {
    const altitude = this._lastAltitude;
    if (
      !immediate &&
      this._lastMapTuneAltitude !== null &&
      Math.abs(altitude - this._lastMapTuneAltitude) <
        this.MAP_ALTITUDE_DEADBAND
    ) {
      return;
    }

    this._lastMapTuneAltitude = altitude;

    const [targetPanSpeed, targetZoomSpeed] =
      this.computeMapInteractionTargets(altitude);

    if (immediate) {
      this.mapControls.panSpeed = targetPanSpeed;
      this.mapControls.zoomSpeed = targetZoomSpeed;
      return;
    }

    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const alpha = 1 - Math.exp(-this.MAP_TUNE_RESPONSE * dt);

    this.mapControls.panSpeed +=
      (targetPanSpeed - this.mapControls.panSpeed) * alpha;
    this.mapControls.zoomSpeed +=
      (targetZoomSpeed - this.mapControls.zoomSpeed) * alpha;
  }

  private computeMapInteractionTargets(
    altitudeMeters: number,
  ): [number, number] {
    const band = this.A1 - this.A2;
    const t = THREE.MathUtils.clamp((altitudeMeters - this.A2) / band, 0, 1);

    const panCurve = t ** 1.6;
    const zoomCurve = t ** 1.2;

    const panSpeed = THREE.MathUtils.lerp(
      this.MAP_PAN_MIN,
      this.MAP_PAN_MAX,
      panCurve,
    );
    const zoomSpeed = THREE.MathUtils.lerp(
      this.MAP_ZOOM_MIN,
      this.MAP_ZOOM_MAX,
      zoomCurve,
    );

    return [panSpeed, zoomSpeed];
  }

  /**
   * Switch to none mode: all controls disabled even if manager is enabled.
   */
  setNone(): void {
    this.switchMode("none");
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) {
      return;
    }

    this._enabled = enabled;
    this.applyEnabledState();
  }

  private applyEnabledState(): void {
    if (!this._enabled || this._mode === "none") {
      this.setControlEnabled("pointer", false);
      this.setControlEnabled("orbit", false);
      this.setControlEnabled("groundOrbit", false);
      this.setControlEnabled("map", false);
      this.setControlEnabled("fly", false);
      return;
    }

    this.setControlEnabled("pointer", this._mode === "pointer");
    this.setControlEnabled("orbit", this._mode === "orbit");
    this.setControlEnabled("groundOrbit", this._mode === "groundOrbit");
    this.setControlEnabled("map", this._mode === "map");
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
      case "orbit":
        this.orbitControls.enabled = enabled;
        break;
      case "groundOrbit":
        this.groundOrbitControls.enabled = enabled;
        break;
      case "map":
        this.mapControls.enabled = enabled;
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
    this.groundOrbitControls.dispose();
    this.mapControls.dispose();
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
   * Get current orbit controls for GUI/state access if needed.
   */
  getOrbitControls(): OrbitControls {
    return this.orbitControls;
  }

  /**
   * Get current map controls for event wiring.
   */
  getMapControls(): MapControls {
    return this.mapControls;
  }

  /**
   * Get the A1 threshold for external queries.
   */
  getA1Threshold(): number {
    return this.A1;
  }

  /**
   * Get the A2 threshold for external queries.
   */
  getA2Threshold(): number {
    return this.A2;
  }

  /**
   * Check if fly mode is available at current altitude.
   */
  canEnableFly(): boolean {
    return this._enabled && this._lastAltitude < this.A2;
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
