import * as THREE from "three";
import { EARTH_RADIUS } from "../../calc/sphere";
import { disatanceToZoom, zoomToDistance } from "../../calc/mercator";

export interface PointerControlsOptions {
  enabled?: boolean;
}

export class PointerControls extends EventTarget {
  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private _enabled = true;
  private lastClickTime = 0;
  private lastClickPos = new THREE.Vector2();
  private doubleClickThreshold = 300; // ms
  private doubleClickDist = 10; // pixels
  private onClickBound: (e: Event) => void;
  private pendingSingleClickTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSingleClickCtx: {
    hitPoint: THREE.Vector3;
    lat: number;
    lng: number;
  } | null = null;

  beforeClick?: (ctx: {
    hitPoint: THREE.Vector3;
    hitLat: number;
    hitLng: number;
  }) => boolean | void;
  beforeDoubleClick?: (ctx: {
    hitPoint: THREE.Vector3;
    hitLat: number;
    hitLng: number;
  }) => boolean | void;

  onChange?: () => void;

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    options?: PointerControlsOptions,
  ) {
    super();
    this.camera = camera;
    this.domElement = domElement;
    this._enabled = options?.enabled ?? true;

    this.onClickBound = (e) => this.onPointerClick(e as MouseEvent);
    this.domElement.addEventListener("click", this.onClickBound);
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  private onPointerClick(event: MouseEvent): void {
    if (!this._enabled) return;

    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const hitPoint = this.rayCastEarth();
    if (!hitPoint) return;

    const { lat, lng } = this.cartesianToLatLng(hitPoint);
    const now = Date.now();
    const timeDiff = now - this.lastClickTime;
    const posDiff = new THREE.Vector2(event.clientX, event.clientY)
      .sub(this.lastClickPos)
      .length();

    const isDoubleClick =
      timeDiff < this.doubleClickThreshold && posDiff < this.doubleClickDist;

    if (isDoubleClick) {
      if (this.pendingSingleClickTimer) {
        clearTimeout(this.pendingSingleClickTimer);
        this.pendingSingleClickTimer = null;
      }
      this.pendingSingleClickCtx = null;
      this.handleDoubleClick(hitPoint, lat, lng);
      this.lastClickTime = 0; // reset
      return;
    }

    this.lastClickTime = now;
    this.lastClickPos.set(event.clientX, event.clientY);
    this.pendingSingleClickCtx = { hitPoint, lat, lng };

    if (this.pendingSingleClickTimer) {
      clearTimeout(this.pendingSingleClickTimer);
    }

    this.pendingSingleClickTimer = setTimeout(() => {
      if (!this._enabled || !this.pendingSingleClickCtx) return;
      const { hitPoint: p, lat: la, lng: ln } = this.pendingSingleClickCtx;
      this.handleClick(p, la, ln);
      this.pendingSingleClickCtx = null;
      this.pendingSingleClickTimer = null;
    }, this.doubleClickThreshold);
  }

  private handleClick(hitPoint: THREE.Vector3, lat: number, lng: number): void {
    const ctx = { hitPoint, hitLat: lat, hitLng: lng };
    if (this.beforeClick?.(ctx) === false) return;

    // Center camera to clicked point
    const currentAltitude = Math.max(
      1,
      this.camera.position.length() - EARTH_RADIUS,
    );
    const nextRadius = EARTH_RADIUS + currentAltitude;
    this.camera.position.copy(hitPoint).normalize().multiplyScalar(nextRadius);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);

    this.onChange?.();
  }

  private handleDoubleClick(
    hitPoint: THREE.Vector3,
    lat: number,
    lng: number,
  ): void {
    const ctx = { hitPoint, hitLat: lat, hitLng: lng };
    if (this.beforeDoubleClick?.(ctx) === false) return;

    // Double-click only zooms +1 and keeps current view center.
    const currentAltitude = Math.max(
      1,
      this.camera.position.length() - EARTH_RADIUS,
    );
    const currentZoom = disatanceToZoom(currentAltitude, 1, 19);
    const nextZoom = Math.min(19, currentZoom + 1);
    const nextAltitude = zoomToDistance(nextZoom, 1, 19);
    const nextRadius = EARTH_RADIUS + nextAltitude;

    this.camera.position.normalize().multiplyScalar(nextRadius);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);

    this.onChange?.();
  }

  private rayCastEarth(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const sphereGeo = new THREE.SphereGeometry(EARTH_RADIUS, 32, 32);
    const sphereMesh = new THREE.Mesh(sphereGeo);
    const intersects = this.raycaster.intersectObject(sphereMesh);

    if (intersects.length > 0) {
      return intersects[0].point;
    }
    return null;
  }

  private cartesianToLatLng(point: THREE.Vector3): {
    lat: number;
    lng: number;
  } {
    const radius = point.length();
    if (radius === 0) return { lat: 0, lng: 0 };

    const lat = (Math.asin(point.y / radius) * 180) / Math.PI;
    const lng = (Math.atan2(point.x, point.z) * 180) / Math.PI;

    return { lat, lng };
  }

  update(): void {
    // Event-driven, no per-frame update needed
  }

  dispose(): void {
    if (this.pendingSingleClickTimer) {
      clearTimeout(this.pendingSingleClickTimer);
      this.pendingSingleClickTimer = null;
    }
    this.pendingSingleClickCtx = null;
    this.domElement.removeEventListener("click", this.onClickBound);
  }
}
