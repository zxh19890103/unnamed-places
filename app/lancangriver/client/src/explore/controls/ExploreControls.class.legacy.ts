import {
  distanceToZoomLevel,
  LatLng,
  latlngToSphere,
  sphereToLatlng,
  zoomLevelToDistance,
} from '@/_3dtiles';
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
  zoom: { zoom: number; latlng: LatLng };

  state: { data: LiveState };
}

type Options = {};

type LiveState = {
  /**
   * Camera distance to the current target (meters). In map mode this is the
   * ground-relative camera-target distance; in orbit mode it is distance to
   * the world-space orbit target.
   */
  distance: number;
  /**
   * Camera distance from the world origin (meters), kept for telemetry.
   */
  originFar: number;
  /**
   * Altitude above the idealized bare-Earth sphere (meters), kept for
   * backward compatibility with telemetry/zoom APIs.
   */
  alt: number;
  /**
   * Camera height above the raised terrain surface (meters). Zero means the
   * camera is exactly at the current active ground radius.
   */
  height: number;
  latlng: LatLng;
  elevationMin: number;
  elevationMax: number;
  zoom: number;
  mode: 'orbit' | 'map';
};

export type ExploreControlsLiveState = LiveState;

/** Height threshold below which the controller switches from orbit to map. */
const MODE_SWAP_LOWER_Height = 30_000;
/** Height threshold above which the controller switches from map to orbit. */
const MODE_SWAP_UPPER_Height = 35_000;

/** Reference camera height used as zoom level 0 distance. */
const referenceHeight = 46_188_000;

/** Minimum ground-relative camera-target distance. */
const minimumHeight = 500;
/** Maximum ground-relative camera-target distance. */
const maximumHeight = referenceHeight + 500;

const nearPlaneAltitudeRatio = 0.1;
const minNearPlaneMeters = 10;
const maxNearPlaneMeters = EARTH_RADIUS * 0.1;
const horizonFarPlaneMargin = 1.1;
const minFarPlaneGapMeters = 1_000;

const WHEEL_END_DELAY_MS = 180;

class ExploreControls extends THREE.Controls<ExploreControlsEventMap> {
  /** World-space point the camera currently looks at. */
  target: THREE.Vector3 = new THREE.Vector3();

  /**
   * Elevation range of the active terrain (meters). The controller uses the
   * max value as a conservative raised ground surface for map-mode math.
   */
  elevation = {
    min: 1_000_000,
    max: 5_000_000,
  };

  /** Current published controller state for telemetry and UI bindings. */
  liveState: LiveState = {
    zoom: 0,
    distance: 0,
    originFar: 0,
    mode: 'orbit',
    alt: 0,
    height: 0,
    elevationMin: 0,
    elevationMax: 0,
    latlng: { lat: 0, lng: 0 },
  };

  /**
   * Minimum distance from camera to target. Switches between orbit
   * (large, world-centered) and map (ground-relative) values as the mode changes.
   */
  private minDistance: number = EARTH_RADIUS + minimumHeight;
  /**
   * Maximum distance from camera to target. Switches between orbit
   * (large, world-centered) and map (ground-relative) values as the mode changes.
   */
  private maxDistance: number = EARTH_RADIUS + maximumHeight;

  private _dispose: VoidFunction = () => {};
  private _disable: VoidFunction = () => {};
  private _disableYaw: () => void;
  private rollAngle = 0;

  /**
   * Radius of the lower (inner) terrain surface = EARTH_RADIUS + min elevation.
   * Currently unused by interactions but kept to represent the full range.
   */
  private radius0: number = EARTH_RADIUS;
  /**
   * Radius of the raised (outer) terrain surface = EARTH_RADIUS + max elevation.
   * Used as the active ground radius for map-mode target, zoom, pan, and rays.
   */
  private radius: number = EARTH_RADIUS;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, _options: Options = {}) {
    super(camera, domElement);

    const pos = this.object.position;
    const currentDistance = pos.distanceTo(this.target);
    const clampedDistance = clampDistance(currentDistance, 0, this.minDistance, this.maxDistance);

    const offset = pos.clone().sub(this.target);
    offset.setLength(clampedDistance);
    pos.copy(this.target.clone().add(offset));
    this.applyCameraPose();

    this._enable();
    this._enableYaw();

    this.setElevation(0, 0);
  }

  declare public object: THREE.PerspectiveCamera;

  public setElevation(min: number, max: number) {
    this.elevation.min = min;
    this.elevation.max = max;

    this.deriveSphereRadius();
    this.updateMinmaxDistance();

    this.syncModeFromHeight();
    this.clampCameraToDistanceLimits();
    this.applyCameraPose();
    this.adjustCameraNearFar();

    this.updateLiveState();

    this.dispatchEvent({ type: 'end', latlng: this.liveState.latlng });
  }

  /**
   * After `setElevation` the ground radius moves, which shifts `height` without
   * moving the camera. Re-clamp the camera so the distance limits keep holding
   * (and the near plane never goes negative) until the next interaction.
   *
   * Runs after `syncModeFromHeight` so the target (origin vs surface point) is
   * already correct for the active mode.
   */
  private clampCameraToDistanceLimits() {
    if (this.liveState.mode === 'map') {
      // ground-relative limits: clamp camera-target distance, keep view direction
      const distance = THREE.MathUtils.clamp(
        this.getDistanceToTarget(),
        this.minDistance,
        this.maxDistance,
      );
      const offset = this.object.position.clone().sub(this.target).setLength(distance);
      this.object.position.copy(this.target.clone().add(offset));
    } else {
      // orbit limits are origin-relative: clamp camera radius from origin
      this.object.position.setLength(
        THREE.MathUtils.clamp(this.object.position.length(), this.minDistance, this.maxDistance),
      );
    }
  }

  private deriveSphereRadius() {
    this.radius0 = EARTH_RADIUS + this.elevation.min;
    this.radius = EARTH_RADIUS + this.elevation.max;
  }

  public getZoomLevel() {
    const viewDistance =
      this.liveState.mode === 'orbit' ? this.getHeightFromCamera() : this.getDistanceToTarget();
    return distanceToZoomLevel(viewDistance, 0, 21, referenceHeight);
  }

  public getLatlng() {
    const pos = this.object.position;
    return sphereToLatlng(pos.x, pos.y, pos.z);
  }

  private getAltitudeFromCamera() {
    return this.object.position.length() - EARTH_RADIUS;
  }

  private getHeightFromCamera() {
    return Math.max(0, this.object.position.length() - this.radius);
  }

  private getDistanceToTarget() {
    return this.object.position.distanceTo(this.target);
  }

  private applyCameraPose() {
    this.syncUp();
    this.object.lookAt(this.target);
    this.object.updateMatrixWorld();
  }

  private setMode(mode: 'orbit' | 'map') {
    if (this.liveState.mode === mode) {
      return;
    }

    this.liveState = {
      ...this.liveState,
      mode,
    };

    this.updateMinmaxDistance();
  }

  private updateMinmaxDistance() {
    /**
     * in map mode, target is at the surface (with height)
     */
    if (this.liveState.mode === 'map') {
      this.minDistance = minimumHeight;
      this.maxDistance = maximumHeight;
    } else {
      this.minDistance = this.radius + minimumHeight;
      this.maxDistance = this.radius + maximumHeight;
    }
  }

  private syncModeFromHeight() {
    const height = this.getHeightFromCamera();

    // from map to orbit
    if (this.liveState.mode === 'map' && height > MODE_SWAP_UPPER_Height) {
      const orbitHeight = THREE.MathUtils.clamp(height, minimumHeight, maximumHeight);
      this.target.set(0, 0, 0);
      this.object.position.setLength(this.radius + orbitHeight);

      this.setMode('orbit');
      return;
    }

    // from orbit to map
    if (this.liveState.mode === 'orbit' && height < MODE_SWAP_LOWER_Height) {
      const target = this.object.position.clone().setLength(this.radius);
      this.target.copy(target);

      this.setMode('map');
    }
  }

  private syncUp() {
    const position = this.object.position;
    const surfaceNormal = (this.liveState.mode === 'map' ? this.target : position)
      .clone()
      .normalize();
    const viewDir = new THREE.Vector3().subVectors(this.target, position).normalize();
    const referenceUp = surfaceNormal.clone();

    // Remove any component of referenceUp along the view axis
    let upPlane = referenceUp.clone().sub(viewDir.clone().multiplyScalar(referenceUp.dot(viewDir)));

    // Looking at the world origin makes the radial normal parallel to the view.
    if (upPlane.lengthSq() < 1e-10) {
      const fallback =
        Math.abs(viewDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      upPlane = fallback.sub(viewDir.clone().multiplyScalar(fallback.dot(viewDir)));
    }

    // Apply roll around the view direction
    const rolledUp = upPlane.normalize().applyAxisAngle(viewDir, this.rollAngle);

    this.object.up.copy(rolledUp);
  }

  private updateLiveState(update: Partial<LiveState> = {}) {
    const distance = this.getDistanceToTarget();
    const alt = this.getAltitudeFromCamera();
    const height = this.getHeightFromCamera();
    const latlng = this.getLatlng();
    const zoom = this.getZoomLevel();
    const originFar = this.object.position.length();

    const snapshot = this.liveState;

    this.liveState = {
      ...this.liveState,
      ...update,
      zoom,
      originFar,
      alt,
      height,
      distance,
      latlng,
      elevationMin: this.elevation.min,
      elevationMax: this.elevation.max,
    };

    if (snapshot.zoom !== this.liveState.zoom) {
      this.dispatchEvent({
        type: 'zoom',
        zoom: this.liveState.zoom,
        latlng: this.liveState.latlng,
      });
    }

    this.dispatchEvent({
      type: 'state',
      data: this.liveState,
    });
  }

  /**
   * Near/far must track altitude every frame: a single fixed pair can't span
   * minimumAltitude..referenceAltitude without either clipping the globe or
   * destroying depth precision on nearby terrain.
   */
  private adjustCameraNearFar() {
    const camera = this.object as THREE.PerspectiveCamera;
    const alt = this.getHeightFromCamera();
    const cameraDistanceFromCenter = camera.position.length();
    const groundRadius = this.radius;

    const near = THREE.MathUtils.clamp(
      alt * nearPlaneAltitudeRatio,
      minNearPlaneMeters,
      maxNearPlaneMeters,
    );

    // distance to earth's limb from the camera; tighter than always rendering to the far side.
    const horizonDistance = Math.sqrt(
      Math.max(
        0,
        cameraDistanceFromCenter * cameraDistanceFromCenter - groundRadius * groundRadius,
      ),
    );

    const far = Math.max(horizonDistance * horizonFarPlaneMargin, near + minFarPlaneGapMeters);

    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  private _enable() {
    const dom = this.domElement as HTMLCanvasElement;

    const deriveMetersPerPixel = createAltitudeScaledWheelZoom({
      factor: 1.2,
      min: 0,
      referenceAltitudeMeters: referenceHeight,
      scale: 10000,
    });

    const panScale = createViewScaledSensitivity({
      camera: this.object as THREE.PerspectiveCamera,
      getRadius: () => this.radius,
      getViewportPx: () => dom.clientHeight || 1,
    });

    // wheel has no native "end" event, so debounce: reset on every event, fire once input goes quiet.

    const MAP_PANNING = 0b0001;
    const MAP_ZOOMING = 0b0010;
    const ORBIT_PANNING = 0b0100;
    const ORBIT_ZOOMING = 0b1000;

    const ACTION_PANNING = MAP_PANNING | ORBIT_PANNING;
    const ACTION_ZOOMING = MAP_ZOOMING | ORBIT_ZOOMING;

    const actionNameToMask = {
      panning: ACTION_PANNING,
      zooming: ACTION_ZOOMING,
    };

    const creatOnWheel = (onlyAction: number) => {
      let currentAction: number = 0;
      let wheelEndTimeout: ReturnType<typeof setTimeout> | undefined;

      const scheduleWheelEnd = () => {
        clearTimeout(wheelEndTimeout);

        wheelEndTimeout = setTimeout(() => {
          this.dispatchEvent({ type: 'end', latlng: this.liveState.latlng });
          currentAction = 0;
        }, WHEEL_END_DELAY_MS);
      };

      const onwheel = (event: WheelEvent) => {
        event.preventDefault();

        // modifier state is re-read every event so pan/zoom can swap mid-gesture without ending it
        const tentativeAction = event.metaKey || event.shiftKey ? ACTION_ZOOMING : ACTION_PANNING;
        const nextAction = tentativeAction & onlyAction;
        if (nextAction === 0) return;

        scheduleWheelEnd();

        if (currentAction !== 0 && nextAction !== currentAction) {
          return;
        }

        currentAction = nextAction;

        const dx = event.deltaX;
        const dy = event.deltaY;

        const mask =
          this.liveState.mode === 'map'
            ? currentAction & (MAP_PANNING | MAP_ZOOMING)
            : currentAction & (ORBIT_PANNING | ORBIT_ZOOMING);

        switch (mask) {
          case ORBIT_ZOOMING: {
            const currentDistance = this.getDistanceToTarget();
            const height = this.getHeightFromCamera();
            const deltaMeters = dy * deriveMetersPerPixel(height);

            const nextDistance = clampDistance(
              currentDistance,
              deltaMeters,
              this.minDistance,
              this.maxDistance,
            );

            const offset = this.object.position.clone().sub(this.target);
            offset.setLength(nextDistance);
            this.object.position.copy(this.target.clone().add(offset));
            this.applyCameraPose();

            this.syncModeFromHeight();
            this.applyCameraPose();
            this.adjustCameraNearFar();

            this.updateLiveState();
            break;
          }

          case ORBIT_PANNING: {
            const offset = this.object.position.clone().sub(this.target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            const height = this.getHeightFromCamera();
            const sensitivity = panScale.orbitSensitivity(height);

            spherical.theta += dx * sensitivity;
            spherical.phi = THREE.MathUtils.clamp(
              spherical.phi + dy * sensitivity,
              0.01,
              Math.PI - 0.01,
            );

            const nextOffset = new THREE.Vector3().setFromSpherical(spherical);
            nextOffset.setLength(
              clampDistance(nextOffset.length(), 0, this.minDistance, this.maxDistance),
            );

            this.object.position.copy(this.target.clone().add(nextOffset));
            this.applyCameraPose();

            this.syncModeFromHeight();
            this.applyCameraPose();
            this.adjustCameraNearFar();

            this.updateLiveState();
            break;
          }

          case MAP_ZOOMING: {
            const currentDistance = this.getDistanceToTarget();
            const height = this.getHeightFromCamera();
            const deltaMeters = dy * deriveMetersPerPixel(height);

            const nextDistance = clampDistance(
              currentDistance,
              deltaMeters,
              this.minDistance,
              this.maxDistance,
            );

            const cameraOffset = this.object.position.clone().sub(this.target);
            cameraOffset.setLength(nextDistance);

            this.object.position.copy(this.target.clone().add(cameraOffset));
            this.applyCameraPose();

            this.syncModeFromHeight();
            this.applyCameraPose();
            this.adjustCameraNearFar();

            this.updateLiveState();
            break;
          }

          case MAP_PANNING: {
            const { east, north } = getLocalBasisAtPoint(this.target);
            const panscale = panScale.panScale(this.getDistanceToTarget());

            const nextTarget = this.target
              .clone()
              .addScaledVector(east, dx * panscale)
              .addScaledVector(north, -dy * panscale);

            const groundTarget = nextTarget.normalize().multiplyScalar(this.radius);
            const cameraOffset = this.object.position.clone().sub(this.target);

            this.target.copy(groundTarget);
            this.object.position.copy(groundTarget.clone().add(cameraOffset));
            this.applyCameraPose();

            this.syncModeFromHeight();
            this.applyCameraPose();
            this.adjustCameraNearFar();

            this.updateLiveState();
            break;
          }

          default: {
            currentAction = 0;
          }
        }
      };

      return {
        handler: onwheel,
        dispose: () => {
          clearTimeout(wheelEndTimeout);
        },
      };
    };

    const onwheel = creatOnWheel(actionNameToMask.zooming | actionNameToMask.panning);

    dom.addEventListener('wheel', onwheel.handler, { passive: false });

    this._disable = () => {
      dom.removeEventListener('wheel', onwheel.handler);
      onwheel.dispose();
    };
  }

  private _enableYaw() {
    const dom = this.domElement as HTMLCanvasElement;

    let moved = false;
    let down = false;

    const downPosition = new THREE.Vector2(0, 0);
    const position1 = new THREE.Vector2(0, 0);
    const position = new THREE.Vector2(0, 0);
    const delta = new THREE.Vector2();

    const earth = new THREE.Sphere(new THREE.Vector3(), this.radius);

    const getTarget = () => {
      const camera = this.object as THREE.PerspectiveCamera;
      const origin = camera.position.clone();
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      const ray = new THREE.Ray(origin, direction);
      const hit = new THREE.Vector3();
      earth.radius = this.radius;

      return ray.intersectSphere(earth, hit) ? hit : null;
    };

    const pdown = (event: PointerEvent) => {
      moved = false;
      down = true;

      downPosition.set(event.pageX, event.pageY);
      position1.copy(downPosition);

      if (this.liveState.mode === 'map') {
        dom.addEventListener('pointermove', pmove);
        dom.addEventListener('pointerup', pup);
      }
    };

    const pmove = (event: PointerEvent) => {
      moved = true;

      position.set(event.pageX, event.pageY);

      delta.subVectors(position, position1);
      const sensitivity = 0.0025;

      const yawAngle = -sensitivity * delta.y;
      const pitchAngle = -sensitivity * delta.x;

      const camera = this.object as THREE.PerspectiveCamera;
      position1.copy(position);

      camera.rotateX(yawAngle);
      camera.rotateY(pitchAngle);

      const nextTarget = getTarget();
      if (nextTarget) {
        this.target.copy(nextTarget);
      }

      this.applyCameraPose();

      this.adjustCameraNearFar();
      this.updateLiveState();
    };

    const pup = () => {
      dom.removeEventListener('pointerup', pup);
      dom.removeEventListener('pointermove', pmove);

      if (moved) {
        moved = false;
        down = false;
        this.dispatchEvent({ type: 'end', latlng: this.liveState.latlng });
      } else if (down) {
        down = false;
        this.dispatchEvent({ type: 'click', latlng: this.liveState.latlng });
      }
    };

    dom.addEventListener('pointerdown', pdown);
    dom.addEventListener('pointerleave', pup);

    this._disableYaw = () => {
      dom.removeEventListener('pointerleave', pup);
      dom.removeEventListener('pointerdown', pdown);
    };
  }

  connect(_element?: HTMLElement | SVGElement): void {
    // no-op
  }

  disconnect(): void {
    // no-op
  }

  dispose(): void {
    this._disable?.();
    this._disableYaw?.();
    this._dispose();
  }

  update(_delta?: number): void {
    // no-op
  }

  //#region camera operations

  private flyToAnimationFrame: number | null = null;

  flyTo(latlng: LatLng) {
    if (this.flyToAnimationFrame !== null) {
      cancelAnimationFrame(this.flyToAnimationFrame);
      this.flyToAnimationFrame = null;
    }

    const camera = this.object as THREE.PerspectiveCamera;
    const startPosition = camera.position.clone();
    const height0 = this.getHeightFromCamera();
    const targetHeight = Math.min(latlng.alt ?? height0, 900_000);
    const targetElevation = this.elevation.max;

    const targetPointVec = new THREE.Vector3().copy(
      latlngToSphere(latlng.lat, latlng.lng, targetElevation),
    );
    const targetPosition = new THREE.Vector3().copy(
      latlngToSphere(latlng.lat, latlng.lng, targetElevation + targetHeight),
    );

    const startDirection = startPosition.clone().sub(targetPointVec).normalize();
    const targetDirection = targetPosition.clone().sub(targetPointVec).normalize();
    const startDistance = startPosition.distanceTo(targetPointVec);
    const targetDistance = targetPosition.distanceTo(targetPointVec);

    const orbitRotation = new THREE.Quaternion().setFromUnitVectors(
      startDirection,
      targetDirection,
    );
    const startOrientation = camera.quaternion.clone();
    const lookDirection = new THREE.Vector3(0, 0, -1);
    const targetOrientation = new THREE.Quaternion().setFromUnitVectors(
      lookDirection,
      targetPointVec.clone().sub(targetPosition).normalize(),
    );

    const durationMs = 12_000;
    const startTime = performance.now();

    return new Promise<void>((resolve) => {
      const animate = (now: number) => {
        const elapsed = Math.min(1, (now - startTime) / durationMs);
        const eased = 0.5 - 0.5 * Math.cos(elapsed * Math.PI);

        const currentRotation = new THREE.Quaternion().identity().slerp(orbitRotation, eased);
        const currentDirection = startDirection.clone().applyQuaternion(currentRotation);
        const currentDistance = startDistance + (targetDistance - startDistance) * eased;
        const nextPosition = targetPointVec
          .clone()
          .add(currentDirection.multiplyScalar(currentDistance));

        camera.position.copy(nextPosition);
        camera.quaternion.copy(startOrientation.clone().slerp(targetOrientation, eased));
        camera.updateMatrixWorld();

        this.update();

        if (elapsed < 1) {
          this.flyToAnimationFrame = requestAnimationFrame(animate);
          return;
        }

        camera.position.copy(targetPosition);
        camera.quaternion.copy(targetOrientation);
        camera.updateMatrixWorld();

        this.update();

        this.syncModeFromHeight();
        this.applyCameraPose();
        this.adjustCameraNearFar();

        this.updateLiveState();

        this.dispatchEvent({
          type: 'end',
          latlng: this.getLatlng(),
        });

        this.flyToAnimationFrame = null;
        resolve();
      };

      this.flyToAnimationFrame = requestAnimationFrame(animate);
    });
  }

  /**
   * Keep the altitude, move the camera to the place of `latlng`,
   * for the mode `map`, also keep the space relation between target and camera
   *
   * Notices:
   * 1. `alt` is ignored
   * 2. no animation
   */
  public setLatlng(latlng: LatLng): void {
    const camera = this.object as THREE.PerspectiveCamera;

    if (this.liveState.mode === 'map') {
      const cameraOffset = camera.position.clone().sub(this.target);
      const nextTarget = new THREE.Vector3().copy(
        latlngToSphere(latlng.lat, latlng.lng, this.radius),
      );
      this.target.copy(nextTarget);
      camera.position.copy(nextTarget.clone().add(cameraOffset));
    } else {
      const currentDistanceFromCenter = camera.position.length();
      const nextDistanceFromCenter = THREE.MathUtils.clamp(
        currentDistanceFromCenter,
        this.minDistance,
        this.maxDistance,
      );

      const nextPosition = latlngToSphere(latlng.lat, latlng.lng, 1);

      camera.position.copy(nextPosition).setLength(nextDistanceFromCenter);

      this.target.set(0, 0, 0);
    }

    this.applyCameraPose();

    this.syncModeFromHeight();
    this.applyCameraPose();
    this.adjustCameraNearFar();

    this.updateLiveState();

    this.dispatchEvent({
      type: 'end',
      latlng: this.getLatlng(),
    });
  }

  /**
   * move the camera `up/down` on the current dir of `camera - target` according to the formula of `zoom-to-dist`
   *
   * notices:
   * 1. no animation
   * 2. `zoom-to-dist`, the dist would be the lower value, instead of the upper one.
   */
  public setZoomLevel(zoom: number) {
    const camera = this.object as THREE.PerspectiveCamera;

    const targetDistance = THREE.MathUtils.clamp(
      zoomLevelToDistance(zoom, 0, 21, referenceHeight),
      minimumHeight,
      maximumHeight,
    );

    const currentDistance =
      this.liveState.mode === 'orbit' ? this.getHeightFromCamera() : this.getDistanceToTarget();
    const deltaDistance = targetDistance - currentDistance;

    const direction = camera.position.clone().sub(this.target).normalize();
    camera.position.addScaledVector(direction, deltaDistance);

    this.applyCameraPose();

    this.syncModeFromHeight();
    this.applyCameraPose();
    this.adjustCameraNearFar();

    this.updateLiveState();
  }

  /**
   * just rotate camera by `deg` around local-z
   * no animation
   */
  public roll(deg: number) {
    const camera = this.object as THREE.PerspectiveCamera;
    this.rollAngle += THREE.MathUtils.degToRad(deg);
    this.syncUp();
    camera.rotateZ(THREE.MathUtils.degToRad(deg));

    this.adjustCameraNearFar();
    this.updateLiveState();

    this.dispatchEvent({ type: 'end', latlng: this.liveState.latlng });
  }
  /**
   * rotate camera by `deg` around local y
   * no animation
   */
  public yaw(deg: number) {
    if (this.liveState.mode !== 'map') {
      return;
    }

    const camera = this.object as THREE.PerspectiveCamera;
    camera.rotateY(THREE.MathUtils.degToRad(deg));

    const earth = new THREE.Sphere(new THREE.Vector3(), this.radius);
    const origin = camera.position.clone();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const ray = new THREE.Ray(origin, direction);
    const hit = new THREE.Vector3();

    if (ray.intersectSphere(earth, hit)) {
      this.target.copy(hit);
    }

    this.applyCameraPose();

    this.adjustCameraNearFar();
    this.updateLiveState();

    this.dispatchEvent({ type: 'end', latlng: this.liveState.latlng });
  }
  /**
   * rotate camera by `deg` around local x
   * no animation
   */
  public pitch(deg: number) {
    if (this.liveState.mode !== 'map') {
      return;
    }

    const camera = this.object as THREE.PerspectiveCamera;
    camera.rotateX(THREE.MathUtils.degToRad(deg));

    const maxPitch = Math.PI / 2 - 0.02;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -maxPitch, maxPitch);

    const earth = new THREE.Sphere(new THREE.Vector3(), this.radius);
    const origin = camera.position.clone();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const ray = new THREE.Ray(origin, direction);
    const hit = new THREE.Vector3();

    if (ray.intersectSphere(earth, hit)) {
      this.target.copy(hit);
    }

    this.applyCameraPose();

    this.adjustCameraNearFar();
    this.updateLiveState();

    this.dispatchEvent({ type: 'end', latlng: this.liveState.latlng });
  }

  //#endregion
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

export type CreateViewScaledSensitivityOptions = {
  /**
   * Camera whose live fov is used to derive the angular size of one pixel.
   */
  camera: THREE.PerspectiveCamera;
  /**
   * Getter for the current active ground radius, so stale captures are avoided
   * when `setEvelation` changes the terrain range.
   */
  getRadius: () => number;
  /**
   * Getter for the current viewport height in pixels, so canvas resizes are
   * picked up without rebuilding the controls.
   */
  getViewportPx: () => number;
  /**
   * Feel multiplier applied to the exact 1:1 "ground tracks cursor" mapping.
   * 1 = physically exact; lower values dampen wheel-gesture deltas.
   */
  feel?: number;
  /**
   * Floor for the view distance so sensitivity never reaches zero.
   */
  minDistanceMeters?: number;
};

/**
 * Derive pan/orbit sensitivity from the angular size of one screen pixel:
 *
 *   radPerPixel   = 2 * tan(fov/2) / viewportHeightPx
 *   metersPerPixel = radPerPixel * viewDistance
 *   panScale       = feel * metersPerPixel            (m/px, map panning)
 *   orbitScale     = feel * metersPerPixel / radius   (rad/px, orbit rotation)
 *
 * With `feel = 1` the ground under the cursor tracks the cursor 1:1 at any
 * altitude, fov, or viewport size; altitude scaling falls out of the view
 * distance automatically, so no power/log curves or reference altitudes are
 * needed.
 */
export const createViewScaledSensitivity = (options: CreateViewScaledSensitivityOptions) => {
  const { camera, getRadius, getViewportPx, feel = 0.5, minDistanceMeters = 1 } = options;

  const radiansPerPixel = () =>
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / getViewportPx();

  const metersPerPixelAt = (viewDistance: number) =>
    Math.max(viewDistance, minDistanceMeters) * radiansPerPixel();

  return {
    /** meters/px — map panning along east/north */
    panScale: (viewDistance: number) => feel * metersPerPixelAt(viewDistance),
    /** rad/px — orbit theta/phi rotation */
    orbitSensitivity: (viewDistance: number) =>
      (feel * metersPerPixelAt(viewDistance)) / getRadius(),
  };
};

export type CreateAltitudeScaledWheelZoomOptions = {
  /**
   *
   */
  factor?: number;
  /**
   * transform the rate to meters per pixel delta.
   */
  scale: number;
  /**
   * 0 - 1
   */
  min?: number;
  /**
   * distance where zoom = 0
   */
  referenceAltitudeMeters: number;
};

export const createAltitudeScaledWheelZoom = (options: CreateAltitudeScaledWheelZoomOptions) => {
  const { scale, referenceAltitudeMeters, min = 0.0001, factor = 1.4 } = options;

  return (altitude: number) => {
    const normalized = Math.min(1, Math.max(0, altitude / referenceAltitudeMeters));
    const i = Math.max(min, Math.pow(normalized, factor));
    return scale * i;
  };
};
