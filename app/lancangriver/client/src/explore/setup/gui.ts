import { GUI } from "lil-gui";
import * as THREE from "three";
import { EARTH_RADIUS } from "../../calc/sphere";
import { ControlsManager } from "../ControlsManager.class";
import { TileMaterialMode } from "../SphereTile.class";
import { Create3dTilesViewer } from "../../experiments/sphere-zoom/viewer";
import {
  ShanshuiWashParams,
  WashPresetName,
  clampWashParams,
  getWashPreset,
} from "../materials/shanshuiWashConfig";
import {
  latlngToSphere,
  sphereToLatlng,
} from "../../experiments/sphere-zoom/core";

const GUI_ZOOM_STEP = 1;

type AttachExploreGuiParameters = {
  threeTilesViewer: Create3dTilesViewer;
  camera: THREE.PerspectiveCamera;
  controlsManager: ControlsManager;
  onRefreshVisibleTilesAndStats: () => void;
  getMaterialMode: () => TileMaterialMode;
  applyMaterialMode: (mode: TileMaterialMode, zoomLevel: number) => boolean;
  triggerCreateOsmTilesOnce: () => boolean;
  getOsmTilesCreated: () => boolean;
  getWashParams: () => ShanshuiWashParams;
  setWashParams: (params: ShanshuiWashParams) => void;
  setWashPreset: (preset: WashPresetName) => void;
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
    getMaterialMode,
    applyMaterialMode,
    triggerCreateOsmTilesOnce,
    getOsmTilesCreated,
    getWashParams,
    setWashParams,
    setWashPreset,
    threeTilesViewer,
  } = parameters;

  const gui = new GUI({ title: "Explore Camera" });
  const cameraFolder = gui.addFolder("Camera");
  const navigationFolder = gui.addFolder("Navigation");
  const terrainFolder = gui.addFolder("Terrain");

  const applyZoomLevel = (zoomLevel: number) => {
    zoomState.zoomLevel = zoomLevel;
    const altitude = threeTilesViewer.zoomToDistance(zoomLevel);
    const nextRadius = EARTH_RADIUS + altitude;
    camera.position.normalize().multiplyScalar(nextRadius);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    onRefreshVisibleTilesAndStats();
  };

  const zoomState = {
    zoomLevel: threeTilesViewer.distanceToZoom(
      Math.max(1, camera.position.length() - EARTH_RADIUS),
    ),
    zoomIn: () => applyZoomLevel(zoomState.zoomLevel + GUI_ZOOM_STEP),
    zoomOut: () => applyZoomLevel(zoomState.zoomLevel - GUI_ZOOM_STEP),
  };

  const syncNavigationStateFromCamera = () => {
    zoomState.zoomLevel = threeTilesViewer.distanceToZoom(
      Math.max(1, camera.position.length() - EARTH_RADIUS),
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
      const clamped = latlngToSphere(clampedLat, latlng.lng, altitude);
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
    materialMode: getMaterialMode(),
    osmTilesCreated: getOsmTilesCreated(),
  };

  const washState = { ...getWashParams() };

  const pushWashState = () => {
    const next = clampWashParams({ ...washState });
    Object.assign(washState, next);
    setWashParams(next);
  };

  const applyPreset = (preset: WashPresetName) => {
    const next = getWashPreset(preset);
    Object.assign(washState, next);
    setWashPreset(preset);
  };

  const osmTileState = {
    createOnce: () => {
      const startedNow = triggerCreateOsmTilesOnce();
      terrainState.osmTilesCreated = getOsmTilesCreated();
      if (terrainState.osmTilesCreated) {
        createOsmTilesController.name("create osm tiles (done)");
      }

      if (startedNow) {
        onRefreshVisibleTilesAndStats();
      }
    },
  };

  const materialModeController = terrainFolder
    .add(terrainState, "materialMode", [
      TileMaterialMode.Basic,
      TileMaterialMode.Dem,
      TileMaterialMode.DemAdvance,
      TileMaterialMode.Debug,
      TileMaterialMode.Clean,
      TileMaterialMode.ShanshuiWash,
    ])
    .name("terrain mode")
    .onChange((value: TileMaterialMode) => {
      const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;
      const zoomLevel = threeTilesViewer.distanceToZoom(cameraDistanceMeters);

      const success = applyMaterialMode(value as TileMaterialMode, zoomLevel);

      if (!success) {
        const currentZoom = zoomLevel.toFixed(1);
        alert(
          `Material mode '${value}' requires zoom level ≤ 15. Current zoom: ${currentZoom}`,
        );
        // Revert to previous mode
        terrainState.materialMode = getMaterialMode();
        materialModeController.updateDisplay();
      } else {
        terrainState.materialMode = getMaterialMode();
      }
    });

  const createOsmTilesController = terrainFolder
    .add(osmTileState, "createOnce")
    .name(
      terrainState.osmTilesCreated
        ? "create osm tiles (done)"
        : "create osm tiles",
    );

  terrainFolder
    .add(washState, "preset", ["high", "balanced", "low"])
    .name("wash preset")
    .onChange((value: WashPresetName) => {
      applyPreset(value);
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "toneBands", 2, 8, 1)
    .name("wash tone bands")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "edgeStrength", 0, 1.5, 0.01)
    .name("wash edge")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "washContrast", 0.5, 2, 0.01)
    .name("wash contrast")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "hazeStrength", 0, 1.2, 0.01)
    .name("wash haze")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "satelliteBlendOpacity", 0, 0.35, 0.01)
    .name("wash sat blend")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "inkDarkness", 0.45, 1.2, 0.01)
    .name("wash ink")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "paperLightness", 0.65, 1, 0.01)
    .name("wash paper")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "ridgeStrength", 0, 1.5, 0.01)
    .name("wash ridge")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "valleyLift", 0, 1, 0.01)
    .name("wash valley")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  terrainFolder
    .add(washState, "satelliteShadowBoost", 0, 1, 0.01)
    .name("wash sat shadow")
    .onChange(() => {
      pushWashState();
      onRefreshVisibleTilesAndStats();
    });

  const flyControlsState = {
    toggle: () => {
      if (controlsManager.isFlyMode()) {
        controlsManager.exitFly();
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
      terrainState.materialMode = getMaterialMode();
      materialModeController.updateDisplay();
      terrainState.osmTilesCreated = getOsmTilesCreated();
      Object.assign(washState, getWashParams());
      createOsmTilesController.name(
        terrainState.osmTilesCreated
          ? "create osm tiles (done)"
          : "create osm tiles",
      );
    },
  };
}
