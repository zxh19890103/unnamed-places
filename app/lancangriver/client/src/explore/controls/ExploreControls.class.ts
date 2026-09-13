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

type ExploreControlsOptions = {
  maxZoom?: number;
  baseDistance?: number;
  minDistance?: number;
};

export class ExploreControls extends THREE.Controls<ExploreControlsEventMap> {
  readonly referenceHeight = 46_188_000;
  readonly maxZoom: number = 21;
  readonly minDistance: number = 500;

  target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  declare public object: THREE.PerspectiveCamera;

  readonly liveState: ControlsLiveState = {
    distance: 0,
    alt: 0,
    height: 0,
    latlng: {
      lat: 0,
      lng: 0,
      alt: 0,
    },
    elevation: 0,
    zoom: 0,
    mode: 'map',
  };

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    options: ExploreControlsOptions,
  ) {
    super(camera, domElement);

    // @ts-expect-error
    this.referenceHeight = options.baseDistance ?? 46_188_000;
    this.maxZoom = options.maxZoom ?? 21;
    this.minDistance = options.minDistance ?? 500;

    this.connect(domElement);
  }

  public setElevation(min: number, max: number) {}
  public getZoomLevel() {
    return 0;
  }
  public setZoomLevel(zoom: number) {}
  public setLatlng(center: LatLng) {}

  update(delta?: number): void {}

  connect(element: HTMLElement | SVGElement): void {
    const domElement = element as HTMLCanvasElement;

    const __noops__ = (...args: any[]) => {};

    let _disableWheel = __noops__;
    const enableWheel = () => {
      const wheelInertialDetector = new WheelInertiaDetector();
      let interactionType: ControlsInteractionType = 0;
      let wheelEndScheduler: any = null;

      const wheelEndHandler = () => {
        wheelEndScheduler = null;
        console.log('interaction end with', interactionType);
        interactionType = 0;
      };

      const scheduleWheelEnd = () => {
        clearTimeout(wheelEndScheduler);
        wheelEndScheduler = setTimeout(wheelEndHandler, 180);
      };

      const wheel = (event: WheelEvent) => {
        event.preventDefault();
        wheelInertialDetector.processEvent(event);

        scheduleWheelEnd();

        let nextInteractionType: ControlsInteractionType = event.altKey || event.metaKey ? 1 : 2;

        if (interactionType === 0) {
          interactionType = nextInteractionType;
        } else if (interactionType !== nextInteractionType) {
          //
        }

        if (interactionType === 1) {
          // desire zoom
          zoom(event.deltaY);
        } else if (interactionType === 2) {
          // pan
          /**
           * @todo rotate to polar near, werid!
           */
          _pan_or_orbit(event.deltaX, event.deltaY);
        }
      };

      domElement.addEventListener('wheel', wheel);

      _disableWheel = () => {
        domElement.removeEventListener('wheel', wheel);
      };
    };

    let _disableYawPitch = __noops__;

    const enableYawPitch = () => {
      let pointerdown: (event: PointerEvent) => void = null;

      {
        let moved = false;
        let down = false;

        const downPosition = new THREE.Vector2(0, 0);
        const position1 = new THREE.Vector2(0, 0);
        const position = new THREE.Vector2(0, 0);
        const delta = new THREE.Vector2();

        const getTarget = () => {
          const earth = new THREE.Sphere(new THREE.Vector3(), _sphere_radius);
          const camera = this.object as THREE.PerspectiveCamera;
          const origin = camera.position.clone();
          const direction = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(camera.quaternion)
            .normalize();
          const ray = new THREE.Ray(origin, direction);
          const hit = new THREE.Vector3();
          earth.radius = _sphere_radius;

          return ray.intersectSphere(earth, hit) ? hit : null;
        };

        pointerdown = (event: PointerEvent) => {
          moved = false;
          down = true;

          downPosition.set(event.pageX, event.pageY);
          position1.copy(downPosition);

          if (this.liveState.mode === 'map') {
            domElement.addEventListener('pointermove', pointermove);
            domElement.addEventListener('pointerup', pointerup);
          }
        };

        const pointermove = (event: PointerEvent) => {
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
            _target.copy(nextTarget);

            render();
            syncDerivedState();
          }
        };

        const pointerup = () => {
          domElement.removeEventListener('pointerup', pointerup);
          domElement.removeEventListener('pointermove', pointermove);

          if (moved) {
            moved = false;
            down = false;
            this.dispatchEvent({ type: 'end', latlng: this.liveState.latlng });
          } else if (down) {
            down = false;
            this.dispatchEvent({ type: 'click', latlng: this.liveState.latlng });
          }
        };
      }

      domElement.addEventListener('pointerdown', pointerdown);
      _disableYawPitch = () => {
        domElement.removeEventListener('pointerdown', pointerdown);
      };
    };

    this._disconnect = () => {
      _disableWheel?.();
      _disableYawPitch?.();

      this._disconnect = null;
    };

    enableWheel();
    enableYawPitch();

    // settings
    /** Height threshold below which the controller switches from orbit to map. */
    const MODE_SWAP_LOWER_Height = 30_000;
    /** Height threshold above which the controller switches from map to orbit. */
    const MODE_SWAP_UPPER_Height = 35_000; // 35_000;

    const camera = this.object;
    const feel = 0.5;
    const referenceAltitudeMeters = this.referenceHeight;
    const minZoom = 0;
    const maxZoom = this.maxZoom;

    const minDistance = this.minDistance;
    const maxDistance = referenceAltitudeMeters + minDistance;

    // state
    let _position = camera.position.clone();
    let _target = this.target.clone();
    let _mode = getMode();
    let _pan_or_orbit: (dx: number, dy: number) => void = __noops__;

    // derived state
    let _target_to_position: THREE.Vector3 = null;
    let _unit_target_to_position: THREE.Vector3 = null;
    let _altitude = -1;
    let _height: number = -1;
    let _latlng: LatLng = null;
    let _viewDistance: number = -1;
    let _elevationMeters = 0;
    /**
     * always be Earth raius
     */
    const _sphere_radius = EARTH_RADIUS;
    let _zoom = -1;

    let endEventScheduler: any = null;
    const scheduleEndEvent = () => {
      if (endEventScheduler !== null) {
        clearTimeout(endEventScheduler);
        endEventScheduler = null;
      }

      endEventScheduler = setTimeout(() => {
        this.dispatchEvent({ type: 'end', latlng: _latlng });
        endEventScheduler = null;
      }, 180);
    };

    const syncDerivedState = (end: boolean = true) => {
      _target_to_position = new THREE.Vector3().subVectors(_position, _target);
      _unit_target_to_position = _target_to_position.clone().normalize();
      _altitude = _position.length() - EARTH_RADIUS;
      _height = _position.length() - _sphere_radius;
      _latlng = sphereToLatlng(_position.x, _position.y, _position.z);
      _viewDistance = getViewDistance(_position, _target).length();
      _zoom = getZoomLevel();

      this.target = _target;

      const liveState = this.liveState;

      liveState.alt = _altitude;
      liveState.height = _height;
      liveState.latlng = _latlng;
      liveState.zoom = _zoom;
      liveState.distance = _viewDistance;
      liveState.mode = _mode;
      liveState.elevation = _elevationMeters;

      this.dispatchEvent({ type: 'state', data: { ...liveState } });

      if (end) {
        scheduleEndEvent();
      }
    };

    syncDerivedState(false);
    _pan_or_orbit = _mode === 'orbit' ? orbit : pan;

    /**
     * orbit -> map: move target to surface.
     * map -> orbit: move target to (0,0,0), keep camera position nochange.
     *
     * when to check?
     *
     * should before camera or target moves, measuring the distance, and see:
     *
     * if distance is larger than ... swap
     * if distance is smaller than ... swap
     * @returns next target
     */
    const checkMode = (nextPosition: THREE.Vector3, nextTarget: THREE.Vector3 = null) => {
      const desireTarget = nextTarget ?? _target;
      const height =
        _mode === 'map'
          ? nextPosition.distanceTo(desireTarget)
          : nextPosition.length() - _sphere_radius;

      if (_mode === 'map') {
        // possible to be orbit
        if (height > MODE_SWAP_UPPER_Height) {
          _mode = 'orbit';
          _pan_or_orbit = orbit;
          console.log('mode map -> orbit');
          return new THREE.Vector3(0, 0, 0);
        }
      }

      if (_mode === 'orbit') {
        // possible to be map
        if (height < MODE_SWAP_LOWER_Height) {
          _mode = 'map';
          _pan_or_orbit = pan;
          console.log('mode orbit -> map');
          return nextPosition.clone().setLength(_sphere_radius);
        }
      }

      return null;
    };

    /**
     * cannot change target, but can change position by return a fixed one
     */
    const clampDistance = (nextPosition: THREE.Vector3, nextTarget: THREE.Vector3 = null) => {
      const desireTarget = nextTarget ?? _target;
      const distance = getViewDistance(nextPosition, desireTarget);
      const distanceScalar = distance.length();
      const r = _mode === 'map' ? 0 : _sphere_radius;

      if (distanceScalar < minDistance) {
        distance.setLength(minDistance + r).add(desireTarget);
      } else if (distanceScalar > maxDistance) {
        distance.setLength(maxDistance + r).add(desireTarget);
      } else {
        return nextPosition;
      }

      return distance;
    };

    // zoom/pan speed sensitivity

    const _metersPerPixelAt = (distance: number) => {
      const viewportPx = domElement.clientHeight;
      const radiansPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewportPx;
      return Math.max(distance, 1) * radiansPerPixel;
    };

    const getMapPanSensitivity = (viewDistance: number) => {
      return feel * _metersPerPixelAt(viewDistance);
    };

    const getOrbitSensitivity = (altitude: number) => {
      return (feel * _metersPerPixelAt(altitude)) / _sphere_radius;
    };

    const getZoomSensitivity = (altitude: number) => {
      const normalized = Math.min(1, Math.max(0, altitude / referenceAltitudeMeters));
      const i = Math.max(0, Math.pow(normalized, 1.2));
      return 10_000 * i;
    };

    // getter
    function getMode(): ControlsMode {
      return 'orbit';
    }

    function getViewDistance(position: THREE.Vector3, target: THREE.Vector3) {
      if (_mode === 'map') {
        return new THREE.Vector3().subVectors(position, target);
      } else {
        if (target.length() > 0) {
          throw new Error("noops! target isn't at the (0,0,0)");
        }

        const distance = new THREE.Vector3().subVectors(position, target);
        const distanceScalar = distance.length() - _sphere_radius;

        if (distanceScalar <= 0) {
          throw new Error('noops, position is inside the ball?');
        }

        distance.setLength(distanceScalar);

        return distance;
      }
    }

    function getZoomLevel() {
      return distanceToZoomLevel(_viewDistance, minZoom, maxZoom, referenceAltitudeMeters);
    }

    // core
    const render = () => {
      // render
      this.target.copy(_target);
      camera.position.copy(_position);

      improveUp();
      improveNearfar();
      camera.lookAt(_target);
      camera.updateMatrixWorld();
    };

    const nearPlaneAltitudeRatio = 0.1;
    const minNearPlaneMeters = 10;
    const maxNearPlaneMeters = EARTH_RADIUS * 0.1;
    const horizonFarPlaneMargin = 1.1;
    const minFarPlaneGapMeters = 1_000;

    const improveNearfar = () => {
      const camera = this.object as THREE.PerspectiveCamera;
      const cameraDistanceFromCenter = camera.position.length();
      const altitude = camera.position.length() - EARTH_RADIUS;
      const sphere_radius = EARTH_RADIUS;

      const near = THREE.MathUtils.clamp(
        altitude * nearPlaneAltitudeRatio,
        minNearPlaneMeters,
        maxNearPlaneMeters,
      );

      // distance to earth's limb from the camera; tighter than always rendering to the far side.
      const horizonDistance = Math.sqrt(
        Math.max(
          0,
          cameraDistanceFromCenter * cameraDistanceFromCenter - sphere_radius * sphere_radius,
        ),
      );

      const far = Math.max(horizonDistance * horizonFarPlaneMargin, near + minFarPlaneGapMeters);

      if (camera.near !== near || camera.far !== far) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    };
    const improveUp = () => {};

    // interactions
    function zoom(dyPixels: number) {
      const sensitivity = getZoomSensitivity(_height);
      const deltaMeters = sensitivity * dyPixels;

      const offset = _unit_target_to_position.clone().setLength(deltaMeters);
      let nextPosition = _position.clone().add(offset);

      const nextTarget = checkMode(nextPosition);
      nextPosition = clampDistance(nextPosition, nextTarget);

      if (nextTarget) _target.copy(nextTarget);
      _position.copy(nextPosition);

      render();
      syncDerivedState();
    }

    const _panTo = (nextTarget: THREE.Vector3) => {
      const { up, east, north } = getLocalBasisAtPoint(_target);
      const eastOffset = _target_to_position.dot(east);
      const northOffset = _target_to_position.dot(north);
      const upOffset = _target_to_position.dot(up);

      const nextBasis = getLocalBasisAtPoint(nextTarget);
      let nextPosition = nextTarget
        .clone()
        .addScaledVector(nextBasis.east, eastOffset)
        .addScaledVector(nextBasis.north, northOffset)
        .addScaledVector(nextBasis.up, upOffset);

      nextPosition = clampDistance(nextPosition, nextTarget);

      _target.copy(nextTarget);
      _position.copy(nextPosition);

      render();
      syncDerivedState();
    };

    function pan(dxPixels: number, dyPixels: number) {
      const sensitivity = getMapPanSensitivity(_viewDistance);

      const { east, north } = getLocalBasisAtPoint(_target);

      const tangentOffset = new THREE.Vector3()
        .addScaledVector(east, dxPixels * sensitivity)
        .addScaledVector(north, -dyPixels * sensitivity);
      const arcDistance = tangentOffset.length();
      const nextTarget = _target.clone().setLength(_sphere_radius);

      if (arcDistance > 0) {
        const arcAngle = arcDistance / _sphere_radius;
        nextTarget
          .multiplyScalar(Math.cos(arcAngle))
          .addScaledVector(tangentOffset.normalize(), _sphere_radius * Math.sin(arcAngle));
      }

      _panTo(nextTarget);
    }

    const spherical = new THREE.Spherical();

    function orbit(dxPixels: number, dyPixels: number) {
      const sensitivity = getOrbitSensitivity(_height);

      spherical.setFromVector3(_position);

      spherical.theta += dxPixels * sensitivity;
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi + dyPixels * sensitivity,
        0.01,
        Math.PI - 0.01,
      );

      let nextPosition = new THREE.Vector3().setFromSpherical(spherical);
      nextPosition = clampDistance(nextPosition, _target);

      _position.copy(nextPosition);

      render();
      syncDerivedState();
    }

    //#region complex interactions implementations
    this.setZoomLevel = (zoom: number) => {
      let dist = zoomLevelToDistance(zoom, minZoom, maxZoom, referenceAltitudeMeters);
      dist = Math.min(maxDistance, Math.max(dist, minDistance));

      const offset = dist - _height;
      const newLength = _position.length() + offset;

      const nextPosition = _position.clone().setLength(newLength);
      const nextTarget = checkMode(nextPosition, _target);
      if (nextTarget) _target.copy(nextTarget);
      _position.copy(nextPosition);

      render();
      syncDerivedState();
    };

    this.setLatlng = (center: LatLng) => {
      if (_mode === 'map') {
        const nextTarget = new THREE.Vector3().copy(latlngToSphere(center.lat, center.lng));
        _panTo(nextTarget);
      } else {
        const nextPosition = new THREE.Vector3().copy(latlngToSphere(center.lat, center.lng));

        nextPosition.setLength(_position.length());

        _position.copy(nextPosition);
        render();
        syncDerivedState();
      }
    };

    this.setElevation = (min: number, max: number) => {
      const avg = (min + max) / 2;
      _elevationMeters = avg;
    };
    //#endregion
  }

  private _disconnect: VoidFunction = null;
  disconnect(): void {
    this._disconnect?.();
  }

  dispose(): void {
    this.disconnect();
  }
}

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

  state: { data: ControlsLiveState };
}

interface ControlsLiveState {
  /**
   * viewDistance
   *
   * Camera distance to the current target (meters). In map mode this is the
   * ground-relative camera-target distance; in orbit mode it is distance to
   * the world-space orbit target.
   */
  distance: number;
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
  elevation: number;
  zoom: number;
  mode: ControlsMode;
}

export type ExploreControlsLiveState = ControlsLiveState;

type ControlsMode = 'orbit' | 'map';
/**
 * 0 - idle
 * 1 - zoom
 * 2 - pan
 */
type ControlsInteractionType = 0 | 1 | 2;

/**
 * @todo it does not work.
 */
class WheelInertiaDetector {
  private recentDeltas: number[] = [];
  private lastTime = 0;

  /**
   * access after processEvent
   */
  public readonly isInertia: boolean = false;

  public processEvent(e: WheelEvent) {
    const now = performance.now();
    const timeDelta = now - this.lastTime;
    this.lastTime = now;

    // Reset buffer if there was a pause (> 100ms) between events
    if (timeDelta > 100) {
      this.recentDeltas = [];
    }

    const currentMag = Math.hypot(e.deltaX, e.deltaY);
    this.recentDeltas.push(currentMag);

    if (this.recentDeltas.length > 20) {
      this.recentDeltas.shift();
    }

    // Inertia check: at least 4 events with strictly decreasing magnitudes
    let isInertia = false;
    if (this.recentDeltas.length >= 4) {
      isInertia = this.recentDeltas.every((val, i, arr) => i === 0 || val <= arr[i - 1]);
    }

    // @ts-expect-error
    this.isInertia = isInertia;

    return isInertia;
  }
}
