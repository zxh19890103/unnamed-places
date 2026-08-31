import { LatLng, latlngToSphere, sphereToLatlng } from '@/_3dtiles';
import { EARTH_RADIUS } from '@/calc/constants';
import { getLocalBasisAtPoint } from '@/calc/sphere';
import * as THREE from 'three';

interface ExploreControlsEventMap {
  /**
   * every time the camera's view change ends.
   */
  end: { latlng: LatLng };
  /**
   * every time the camera's view changes
   */
  change: { latlng: LatLng };
  /**
   * when user click the earth, null if fail hit
   */
  click: { latlng: LatLng };
  /**
   * zoom change
   */
  zoom: {};
  state: { data: LiveState };
}

type Options = {};

type LiveState = {
  /**
   * distance from camera to target
   */
  distance: number;

  alt: number;
  latlng: LatLng;

  mode: 'orbit' | 'map';
};

export type ExploreControlsLiveState = LiveState;

const MODE_SWAP_LOWER_ALTITUDE = 10_000;
const MODE_SWAP_UPPER_ALTITUDE = 13_000;
const distanceScale = 1_000;

export class ExploreControls extends THREE.Controls<ExploreControlsEventMap> {
  target: THREE.Vector3 = new THREE.Vector3();

  liveState: LiveState = {
    distance: 0,
    mode: 'orbit',
    alt: 0,
    latlng: { lat: 0, lng: 0 },
  };

  minDistance: number = 5_000;
  maxDistance: number = EARTH_RADIUS * 10;

  rotateSpeed: number = 1;
  zoomSpeed: number = 1;

  enableDamping: boolean = true;

  private _dispose: VoidFunction = () => {};
  private _disable: VoidFunction = () => {};

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, options: Options = {}) {
    super(camera, domElement);
    this._init();
    this._disable = this._enable();
    this.syncModeFromAltitude();
    this.updateLiveState();
  }

  private getAltitudeFromCamera() {
    return this.object.position.length() - EARTH_RADIUS;
  }

  private getDistanceToTarget() {
    return this.object.position.distanceTo(this.target);
  }

  private setMode(mode: 'orbit' | 'map') {
    if (this.liveState.mode === mode) {
      return;
    }

    this.liveState = {
      ...this.liveState,
      mode,
    };

    this.dispatchEvent({
      type: 'state',
      data: this.liveState,
    });
  }

  private syncModeFromAltitude() {
    const altitude = this.getAltitudeFromCamera();

    if (this.liveState.mode === 'map' && altitude > MODE_SWAP_UPPER_ALTITUDE) {
      this.setMode('orbit');
      return;
    }

    if (this.liveState.mode === 'orbit' && altitude < MODE_SWAP_LOWER_ALTITUDE) {
      this.setMode('map');
    }
  }

  private updateLiveState(update: Partial<LiveState> = {}) {
    const pos = this.object.position;
    const distance = pos.distanceTo(this.target);
    const alt = Math.max(0, pos.length() - EARTH_RADIUS);
    const latlng = sphereToLatlng(pos.x, pos.y, pos.z);

    this.liveState = {
      ...this.liveState,
      ...update,
      alt,
      distance,
      latlng,
    };

    this.dispatchEvent({
      type: 'state',
      data: this.liveState,
    });
  }

  private _init() {
    const pos = this.object.position;
    const currentDistance = pos.distanceTo(this.target);
    const clampedDistance = clampDistance(currentDistance, 0, this.minDistance, this.maxDistance);

    const offset = pos.clone().sub(this.target);
    offset.setLength(clampedDistance);
    pos.copy(this.target.clone().add(offset));
    this.object.lookAt(this.target);
  }

  private _enable() {
    const dom = this.domElement as HTMLCanvasElement;

    const onwheel = (event: WheelEvent) => {
      event.preventDefault();

      const dx = event.deltaX;
      const dy = event.deltaY;
      const isShiftKey = event.metaKey || event.shiftKey;

      if (this.liveState.mode === 'map') {
        if (isShiftKey) {
          const currentDistance = this.getDistanceToTarget();
          const deltaMeters = deriveMetersByZoomingDeltaPixel(dy, this.getAltitudeFromCamera());
          const nextDistance = clampDistance(
            currentDistance,
            deltaMeters,
            this.minDistance,
            this.maxDistance,
          );

          const cameraOffset = this.object.position.clone().sub(this.target);
          cameraOffset.setLength(nextDistance);
          this.object.position.copy(this.target.clone().add(cameraOffset));
          this.object.lookAt(this.target);
          this.updateLiveState();
          this.syncModeFromAltitude();
          return;
        }

        const { east, north } = getLocalBasisAtPoint(this.target);
        const altitude = this.getAltitudeFromCamera();
        const panScale = Math.max(10, Math.min(5_000, altitude * 0.02));

        const nextTarget = this.target
          .clone()
          .addScaledVector(east, dx * (panScale / 100))
          .addScaledVector(north, -dy * (panScale / 100));

        const groundTarget = nextTarget.normalize().multiplyScalar(EARTH_RADIUS);
        const cameraOffset = this.object.position.clone().sub(this.target);

        this.target.copy(groundTarget);
        this.object.position.copy(groundTarget.clone().add(cameraOffset));
        this.object.lookAt(this.target);
        this.updateLiveState();
        this.syncModeFromAltitude();
        return;
      }

      if (isShiftKey) {
        const currentDistance = this.getDistanceToTarget();
        const deltaMeters = deriveMetersByZoomingDeltaPixel(dy, this.getAltitudeFromCamera());
        const nextDistance = clampDistance(
          currentDistance,
          deltaMeters,
          this.minDistance,
          this.maxDistance,
        );

        const offset = this.object.position.clone().sub(this.target);
        offset.setLength(nextDistance);
        this.object.position.copy(this.target.clone().add(offset));
        this.object.lookAt(this.target);
        this.updateLiveState();
        this.syncModeFromAltitude();
        return;
      }

      const offset = this.object.position.clone().sub(this.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      const sensitivity = deriveSensitivityFromRotationDelta(dx, dy, this.getAltitudeFromCamera());

      spherical.theta -= dx * sensitivity;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + dy * sensitivity, 0.01, Math.PI - 0.01);

      const nextOffset = new THREE.Vector3().setFromSpherical(spherical);
      nextOffset.setLength(
        clampDistance(nextOffset.length(), 0, this.minDistance, this.maxDistance),
      );

      this.object.position.copy(this.target.clone().add(nextOffset));
      this.object.lookAt(this.target);
      this.updateLiveState();
      this.syncModeFromAltitude();
    };

    dom.addEventListener('wheel', onwheel, { passive: false });

    this._disable = () => {
      dom.removeEventListener('wheel', onwheel);
    };

    return this._disable;
  }

  setObjectAt(latlng: LatLng, alt: number = 100_000) {
    const position = latlngToSphere(latlng.lat, latlng.lng, alt);

    this.target.set(0, 0, 0);
    this.object.position.copy(position);
    this.object.lookAt(this.target);
    this.updateLiveState();
    this.syncModeFromAltitude();
  }

  setObjectAtLowAlt(latlng: LatLng, alt: number = 1_000) {
    const groundTarget = latlngToSphere(latlng.lat, latlng.lng, 0);
    const position = latlngToSphere(latlng.lat, latlng.lng, alt);

    this.target.copy(groundTarget);
    this.object.position.copy(position);
    this.object.lookAt(this.target);
    this.updateLiveState();
    this.syncModeFromAltitude();
  }

  connect(_element?: HTMLElement | SVGElement): void {
    // no-op
  }

  disconnect(): void {
    // no-op
  }

  dispose(): void {
    this._disable();
    this._dispose();
  }

  update(_delta?: number): void {
    // no-op
  }
}

function clampDistance(
  currentDistance: number,
  delta: number,
  minDistance: number,
  maxDistance: number,
) {
  const nextDistance = currentDistance + delta;
  return THREE.MathUtils.clamp(nextDistance, minDistance, maxDistance);
}

export const deriveSensitivityFromRotationDelta = (dx: number, dy: number, far: number) => {
  const distanceToSurface = Math.max(far, 0);
  const log2 = 1 + Math.log2(1 + distanceToSurface / distanceScale);
  const factor = 0.000001 * log2;
  return Math.max(Math.abs(dx), Math.abs(dy)) * factor;
};

export const deriveMetersByZoomingDeltaPixel = (delta: number, far: number) => {
  const distanceToSurface = Math.max(far, 0);

  if (distanceToSurface < 10_000 && delta < 0) {
    return delta * 0.0008 * Math.log2(distanceToSurface || 1);
  }

  const log2 = 1 + Math.log2(1 + distanceToSurface / distanceScale);
  const factor = 1_000 * log2;
  return delta * factor;
};
