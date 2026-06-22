import { GUI } from "lil-gui";
import * as THREE from "three";
import { disatanceToZoom, zoomToDistance } from "../calc/mercator";
import { EARTH_RADIUS, latlngToSphere, sphereToLatlng } from "../calc/sphere";
import { ControlsManager } from "./ControlsManager.class";

const GUI_ZOOM_MIN = 1;
const GUI_ZOOM_MAX = 19;
const GUI_ZOOM_STEP = 1;

type AttachExploreGuiParameters = {
  camera: THREE.PerspectiveCamera;
  controlsManager: ControlsManager;
  onRefreshVisibleTilesAndStats: () => void;
  getDemEnabled: () => boolean;
  applyDemMode: (requested: boolean, zoomLevel: number) => void;
  getGroundOrbitEnabled: () => boolean;
  setGroundOrbitEnabled: (enabled: boolean) => void;
  onRandomizeGroundOrbit: () => void;
  getGroundOrbitAngles: () => { azimuthDeg: number; altitudeDeg: number };
};

export type ExploreGuiHandle = {
  destroy: () => void;
  syncTerrainState: () => void;
};

export function attachExploreGui(
  parameters: AttachExploreGuiParameters,
): ExploreGuiHandle {
  const {
    camera,
    controlsManager,
    onRefreshVisibleTilesAndStats,
    getDemEnabled,
    applyDemMode,
    getGroundOrbitEnabled,
    setGroundOrbitEnabled,
    onRandomizeGroundOrbit,
    getGroundOrbitAngles,
  } = parameters;

  const gui = new GUI({ title: "Explore Camera" });
  const cameraFolder = gui.addFolder("Camera");
  const navigationFolder = gui.addFolder("Navigation");
  const terrainFolder = gui.addFolder("Terrain");

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

    onRefreshVisibleTilesAndStats();
  };

  const zoomState = {
    zoomLevel: disatanceToZoom(
      Math.max(1, camera.position.length() - EARTH_RADIUS),
      GUI_ZOOM_MIN,
      GUI_ZOOM_MAX,
    ),
    zoomIn: () => applyZoomLevel(zoomState.zoomLevel + GUI_ZOOM_STEP),
    zoomOut: () => applyZoomLevel(zoomState.zoomLevel - GUI_ZOOM_STEP),
  };

  const syncNavigationStateFromCamera = () => {
    zoomState.zoomLevel = disatanceToZoom(
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
    onRefreshVisibleTilesAndStats();
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

  const terrainState = {
    demEnabled: getDemEnabled(),
    groundOrbitEnabled: getGroundOrbitEnabled(),
    randomizeGroundOrbit: () => {
      onRandomizeGroundOrbit();
      terrainState.groundOrbitEnabled = getGroundOrbitEnabled();
      groundOrbitToggleController.updateDisplay();
      syncGroundOrbitAngles();
    },
  };

  const groundOrbitAnglesState = {
    azimuthDeg: 0,
    altitudeDeg: 0,
  };

  const syncGroundOrbitAngles = () => {
    const next = getGroundOrbitAngles();
    groundOrbitAnglesState.azimuthDeg = Number(next.azimuthDeg.toFixed(1));
    groundOrbitAnglesState.altitudeDeg = Number(next.altitudeDeg.toFixed(1));
    groundOrbitAzimuthController.updateDisplay();
    groundOrbitAltitudeController.updateDisplay();
  };

  const groundOrbitToggleController = terrainFolder
    .add(terrainState, "groundOrbitEnabled")
    .name("ground orbit")
    .onChange((value: boolean) => {
      setGroundOrbitEnabled(value);
      terrainState.groundOrbitEnabled = getGroundOrbitEnabled();
      groundOrbitToggleController.updateDisplay();
      syncGroundOrbitAngles();
    });

  terrainFolder
    .add(terrainState, "randomizeGroundOrbit")
    .name("random azimuth/alt");

  const groundOrbitAzimuthController = terrainFolder
    .add(groundOrbitAnglesState, "azimuthDeg")
    .name("azimuth (deg)")
    .listen()
    .disable();

  const groundOrbitAltitudeController = terrainFolder
    .add(groundOrbitAnglesState, "altitudeDeg")
    .name("altitude (deg)")
    .listen()
    .disable();

  const demToggleController = terrainFolder
    .add(terrainState, "demEnabled")
    .name("use DEM material")
    .onChange((value: boolean) => {
      const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
      const zoomLevel = disatanceToZoom(cameraDistanceMeters);
      applyDemMode(value, zoomLevel);
      terrainState.demEnabled = getDemEnabled();
      demToggleController.updateDisplay();
    });

  const flyControlsState = {
    toggle: () => {
      if (controlsManager.isFlyMode()) {
        controlsManager.disableFly();
      } else {
        controlsManager.forceFly();
      }
    },
  };

  cameraFolder
    .add(camera, "fov", 20, 120, 1)
    .name("fov")
    .onChange(() => camera.updateProjectionMatrix());

  navigationFolder.add(zoomState, "zoomIn").name("zoom +");
  navigationFolder.add(zoomState, "zoomOut").name("zoom -");
  navigationFolder.add(rotationState, "deltaDeg", 1, 180, 1).name("rotate Δ");
  navigationFolder.add(rotationState, "rotatePositiveY").name("rotate +Y");
  navigationFolder.add(rotationState, "rotateNegativeY").name("rotate -Y");
  navigationFolder.add(rotationState, "rotateUp").name("rotate up");
  navigationFolder.add(rotationState, "rotateDown").name("rotate down");
  navigationFolder
    .add(altitudeState, "stepMeters", 1, 200, 1)
    .name("alt step (m)");
  navigationFolder.add(altitudeState, "increaseAltitude").name("alt +");
  navigationFolder.add(altitudeState, "decreaseAltitude").name("alt -");

  cameraFolder.add(flyControlsState, "toggle").name("fly controls on/off");

  cameraFolder.open();
  navigationFolder.open();
  terrainFolder.open();

  return {
    destroy: () => gui.destroy(),
    syncTerrainState: () => {
      terrainState.demEnabled = getDemEnabled();
      demToggleController.updateDisplay();
      terrainState.groundOrbitEnabled = getGroundOrbitEnabled();
      groundOrbitToggleController.updateDisplay();
      syncGroundOrbitAngles();
    },
  };
}
