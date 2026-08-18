import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";

import {
  createSceneState,
  getZoomLevel,
  setGlobalTileMaterialMode,
  globalTileMaterialMode,
  SceneState,
} from "./explore/setup";
import { SceneMonitor } from "./explore/dom/SceneMonitor";
import type { LatLng } from "./calc/types";
import type { Sphere } from "./explore/Sphere.class";
import { buildFlatModalUrl, FLAT_CENTER_CONFIRMED } from "./flat/protocol";
import { JourneyPanel } from "./photos/JourneyPanel";
import { buildJourneyDays } from "./photos/journey";
import { fetchGeotaggedPhotos } from "./photos/sources";
import type { JourneyDayNode, PhotoRecord } from "./photos/types";
import type { TilesManager } from "./explore/TilesManager.class";
import type { LatLngBBox } from "./explore/setup/coverageVisibility";
import { BASE_URL, ELEVATION_SCALE } from "./calc/constants";
import { SphereTile, TileMaterialMode } from "./explore/SphereTile.class";
import { Create3dTilesViewer } from "./experiments/sphere-zoom/viewer";
import { MiniMap } from "./explore/dom/MiniMap";
import { ControlsManager } from "./explore/ControlsManager.class";
import { latlngToStandardTileZxy } from "./experiments/sphere-zoom/tile";

type OrbitClickEvent = {
  type: "click";
  latlng: LatLng;
};

type DemAltitudeResponse = {
  ok: boolean;
  min: number;
  max: number;
};

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sceneState, setSceneState] = useState<SceneState>(null);

  useEffect(() => {
    const hostElement = hostRef.current;
    const state = createSceneState(hostElement);
    setSceneState(state);

    return () => {
      state.cleanup();
      hostElement.removeChild(state.renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <div ref={hostRef} className="absolute inset-0 overflow-hidden" />
      {sceneState && (
        <CreateScene sceneState={sceneState} host={hostRef.current} />
      )}
    </div>
  );
}

const CreateScene = memo(
  ({ host, sceneState }: { sceneState: SceneState; host: HTMLDivElement }) => {
    const [isFlatModalOpen, setIsFlatModalOpen] = useState(false);
    const [flatFrameUrl, setFlatFrameUrl] = useState("/flat.html");
    const [journeyRecords, setJourneyRecords] = useState<PhotoRecord[]>([]);
    const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
    const [journeyError, setJourneyError] = useState<string | null>(null);
    const [journeyLoading, setJourneyLoading] = useState(false);

    useEffect(() => {
      const {
        scene,
        camera,
        renderer,
        controlsManager,
        stats,
        resize,
        onFrame,
      } = sceneState;

      const clickRaycaster = new THREE.Raycaster();
      const clickCoordinates = new THREE.Vector2();
      const sphereWorldPosition = new THREE.Vector3();
      const cameraWorldPosition = new THREE.Vector3();
      const surfaceNormal = new THREE.Vector3();
      const surfaceToCamera = new THREE.Vector3();

      const handleMapClick = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        clickCoordinates.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        clickCoordinates.y =
          -((event.clientY - rect.top) / rect.height) * 2 + 1;
        clickRaycaster.setFromCamera(clickCoordinates, camera);

        sceneState.sphere.updateWorldMatrix(true, true);
        sceneState.sphere.getWorldPosition(sphereWorldPosition);
        camera.getWorldPosition(cameraWorldPosition);

        const hit = clickRaycaster
          .intersectObject(sceneState.sphere, true)
          .find((intersection) => {
            if (!(intersection.object instanceof SphereTile)) {
              return false;
            }

            let object: THREE.Object3D | null = intersection.object;
            while (object) {
              if (!object.visible) {
                return false;
              }
              if (object === sceneState.sphere) {
                break;
              }
              object = object.parent;
            }

            surfaceNormal
              .copy(intersection.point)
              .sub(sphereWorldPosition)
              .normalize();
            surfaceToCamera
              .copy(cameraWorldPosition)
              .sub(intersection.point)
              .normalize();

            return surfaceNormal.dot(surfaceToCamera) > 0;
          });
        if (!hit) {
          return;
        }

        const radius = hit.point.length();
        const latlng = {
          lat: (Math.asin(hit.point.y / radius) * 180) / Math.PI,
          lng: (Math.atan2(hit.point.x, hit.point.z) * 180) / Math.PI,
        };

        const orbitControls = controlsManager.orbitControls as unknown as {
          dispatchEvent: (event: OrbitClickEvent) => void;
        };

        orbitControls.dispatchEvent({
          type: "click",
          latlng,
        });
      };

      const handleResize = () => resize();
      window.addEventListener("resize", handleResize);

      let frameId = 0;
      let lastTime = performance.now();

      const animate = () => {
        frameId = window.requestAnimationFrame(animate);
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.016); // Cap at 16ms
        lastTime = now;

        onFrame(delta * 1000);

        controlsManager.update(delta);

        stats.update();
        renderer.render(scene, camera);
      };

      resize();
      animate();

      console.log("why????");
      renderer.domElement.addEventListener("click", handleMapClick);

      return () => {
        console.log("why?");
        window.removeEventListener("resize", handleResize);
        renderer.domElement.removeEventListener("click", handleMapClick);
        window.cancelAnimationFrame(frameId);
      };
    }, [sceneState]);

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data?.type !== FLAT_CENTER_CONFIRMED) {
          return;
        }

        const center = event.data.payload as LatLng | undefined;

        console.log("the center picked", center);

        void focus3dAtCenter(center);
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, []);

    const openFlatModal = async () => {
      const center = sceneState.getCurrentCenterLatLng();
      setFlatFrameUrl(buildFlatModalUrl(center));
      setIsFlatModalOpen(true);
    };

    let isTopdownView = true;
    const handleDirectSwitchTo3dView = async () => {
      if (isTopdownView) {
        const center = sceneState.getCurrentCenterLatLng();
        focus3dAtCenter(center);
        isTopdownView = false;
      } else {
        // const target = sceneState.controlsManager.orbitControls.target;
        sceneState.threeTilesViewer.lookAtOrigin();
        sceneState.refreshVisibleTilesOnCameraChanges();
        isTopdownView = true;
      }
    };

    const handleLoadGeotaggedPhotos = async () => {
      setJourneyLoading(true);

      try {
        const mode = import.meta.env.DEV ? "dev" : "prod";
        const photos =
          mode === "dev"
            ? await fetchGeotaggedPhotos({ mode: "dev" })
            : await fetchGeotaggedPhotos({ mode: "prod" });

        const journey = buildJourneyDays(photos);

        setJourneyRecords(journey.records);
        setJourneyDays(journey.days);
        setJourneyError(null);

        console.log("Loaded geotagged photos", photos);
        console.log("Built life journey", journey);
      } catch (error) {
        console.warn("Failed to load life journey photos", error);
        setJourneyError("Could not load photos");
      } finally {
        setJourneyLoading(false);
      }
    };

    const handleSelectJourneyDay = async (dayKey: string) => {
      setSelectedDayKey(dayKey);

      const selectedDay = journeyDays.find((day) => day.dayKey === dayKey);
      if (!selectedDay) {
        return;
      }

      try {
        throw new Error("not implemented");
      } catch (error) {
        console.warn("Failed to focus journey day", error);
      }
    };

    const [journeyDays, setJourneyDays] = useState<JourneyDayNode[]>([]);

    const focus3dAtCenter = async (center: LatLng | null | undefined) => {
      if (!center) {
        return;
      }

      await sceneState.focusGroundOrbitAtLatLng(center);
      setIsFlatModalOpen(false);
    };

    return (
      <>
        <div className="pointer-events-none fixed left-1/2 top-3 z-40 flex -translate-x-1/2 flex-wrap justify-center gap-1.5 px-2">
          <TerrianModeSelect
            controls={sceneState.controlsManager}
            tileManager={sceneState.tileManager}
            getCurrentGroundCenter={sceneState.getCurrentGroundCenterLatLng}
            setVisibleTilesElevationRange={
              sceneState.setVisibleTilesElevationRange
            }
          />
        </div>

        <div className="fixed left-4 top-3 z-40 ">
          <JourneyPanel
            days={journeyDays}
            selectedDayKey={selectedDayKey}
            loading={journeyLoading}
            error={journeyError}
            onSelectDay={(dayKey) => {
              void handleSelectJourneyDay(dayKey);
            }}
          />
        </div>

        <OpsPanel
          openFlatModal={openFlatModal}
          handleDirectSwitchTo3dView={handleDirectSwitchTo3dView}
          handleLoadGeotaggedPhotos={handleLoadGeotaggedPhotos}
          getVisibleGroundBBox={sceneState.getVisibleGroundBBox}
          getCurrentLookingAtCenter={sceneState.getCurrentCenterLatLng}
          tileManager={sceneState.tileManager}
          threeTilesViewer={sceneState.threeTilesViewer}
        />

        <div className="fixed bottom-3 left-4 z-30 ">
          <SceneMonitor
            sphere={sceneState.sphere}
            threeJsStats={sceneState.stats}
          />
        </div>

        {isFlatModalOpen && (
          <div className="absolute inset-0 z-1994 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
            <div className="relative h-[80vh] w-[80vw] overflow-hidden rounded-2xl bg-white shadow-2xl">
              <button
                type="button"
                onClick={() => setIsFlatModalOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-md bg-slate-950/80 px-3 py-1.5 text-sm text-white transition-colors hover:bg-slate-900"
              >
                Close
              </button>
              <iframe
                title="Flat map selector"
                src={flatFrameUrl}
                className="h-full w-full border-0"
              />
            </div>
          </div>
        )}

        <MiniMap
          controls={sceneState.controlsManager}
          positionGetter={sceneState.getCurrentCenterLatLng}
          precision={9}
        />
      </>
    );
  },
);

type OpsPanelProps = {
  openFlatModal: () => Promise<void>;
  handleDirectSwitchTo3dView: () => Promise<void>;
  handleLoadGeotaggedPhotos: () => Promise<void>;
  getVisibleGroundBBox: () => LatLngBBox | null;
  getCurrentLookingAtCenter: () => LatLng | null;
  tileManager: TilesManager;
  threeTilesViewer: Create3dTilesViewer;
};

const OpsPanel = ({
  openFlatModal,
  handleDirectSwitchTo3dView,
  handleLoadGeotaggedPhotos,
  getCurrentLookingAtCenter,
  tileManager,
  threeTilesViewer,
}: OpsPanelProps) => {
  const [viewerUpdateEnabled, setViewerUpdateEnabled] = useState(
    !tileManager.frozen,
  );

  return (
    <div className="pointer-events-none fixed bottom-3 right-4 z-40 w-[min(280px,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/80 p-2.5 text-white shadow-[0_14px_35px_rgba(0,0,0,0.3)] backdrop-blur-md">
        <div className="mb-2 border-b border-white/10 px-1 pb-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
            Map workspace
          </div>
          <div className="mt-0.5 text-sm font-semibold tracking-wide">
            Scene controls
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => {
              const nextFrozen = !tileManager.frozen;
              tileManager.frozen = nextFrozen;
              const nextUpdateEnabled = !nextFrozen;
              setViewerUpdateEnabled(nextUpdateEnabled);
            }}
            className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/[0.14]"
          >
            {viewerUpdateEnabled ? "Pause tile updates" : "Resume tile updates"}
          </button>
          <button
            type="button"
            onClick={() => void openFlatModal()}
            className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/[0.14]"
          >
            Open flat map
          </button>
          <button
            type="button"
            onClick={() => void handleDirectSwitchTo3dView()}
            className="rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/[0.14]"
          >
            Top Down / 45
          </button>
          <button
            type="button"
            onClick={() => void handleLoadGeotaggedPhotos()}
            className="rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/[0.14]"
          >
            Load photo locations
          </button>
          <a
            target="_blank"
            href="/jobs-create"
            onClick={(event) => {
              event.preventDefault();
              const center = getCurrentLookingAtCenter();
              window.open(
                `/jobs-create?latlng=${center.lat},${center.lng}`,
                "_blank",
              );
            }}
            className="rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/[0.14]"
          >
            Create OSM tile job
          </a>
        </div>
      </div>
    </div>
  );
};

const TerrianModeSelect = memo(
  ({
    controls,
    tileManager,
    getCurrentGroundCenter,
    setVisibleTilesElevationRange,
  }: {
    controls: ControlsManager;
    tileManager: TilesManager;
    getCurrentGroundCenter: () => LatLng | null;
    setVisibleTilesElevationRange: (
      minMeters: number,
      maxMeters: number,
    ) => void;
  }) => {
    const [mode, setMode] = useState(globalTileMaterialMode);
    const [zoomLevel, setZoomLevel] = useState(() => getZoomLevel());
    const [isElevationLoading, setIsElevationLoading] = useState(false);

    useEffect(() => {
      const syncZoomLevel = () => setZoomLevel(getZoomLevel());
      const orbitControls = controls.orbitControls;

      syncZoomLevel();
      orbitControls.addEventListener("change", syncZoomLevel);
      orbitControls.addEventListener("end", syncZoomLevel);

      return () => {
        orbitControls.removeEventListener("change", syncZoomLevel);
        orbitControls.removeEventListener("end", syncZoomLevel);
      };
    }, [controls]);

    const modeLabels: Record<TileMaterialMode, string> = {
      [TileMaterialMode.Basic]: "Satellite",
      [TileMaterialMode.Dem]: "Elevation",
      [TileMaterialMode.Clean]: "Clean",
      [TileMaterialMode.Debug]: "Debug",
      [TileMaterialMode.ShanshuiWash]: "Watercolor",
    };

    const applyMaterialMode = (requested: TileMaterialMode) => {
      for (const node of tileManager.getAttachedNodes()) {
        if (node.tile) {
          node.tile.setMaterialMode(requested);
        }
      }

      return true;
    };

    const applyElevationMode = async () => {
      if (zoomLevel < 11 || isElevationLoading) {
        alert("hi, zoom level shall be greater than 11");
        return;
      }

      const groundCenter = getCurrentGroundCenter();
      if (!groundCenter) {
        return;
      }

      const [, x, y] = latlngToStandardTileZxy(groundCenter, 10);
      setIsElevationLoading(true);

      try {
        const response = await fetch(
          `${BASE_URL}/raster/dem/10/${x}/${y}/altitude`,
        );

        if (!response.ok) {
          throw new Error(`Altitude request failed: ${response.status}`);
        }

        const altitude = (await response.json()) as DemAltitudeResponse;
        if (
          !altitude.ok ||
          !Number.isFinite(altitude.min) ||
          !Number.isFinite(altitude.max) ||
          altitude.max < altitude.min
        ) {
          throw new Error("Altitude response had an invalid elevation range");
        }

        setVisibleTilesElevationRange(
          altitude.min * ELEVATION_SCALE,
          altitude.max * ELEVATION_SCALE,
        );
        applyMaterialMode(TileMaterialMode.Dem);
        setMode(TileMaterialMode.Dem);
        setGlobalTileMaterialMode(TileMaterialMode.Dem);
      } catch (error) {
        console.warn("Failed to prepare elevation terrain", error);
      } finally {
        setIsElevationLoading(false);
      }
    };

    return (
      <>
        <span>{zoomLevel}</span>
        {Object.values(TileMaterialMode).map((materialMode) => {
          const isSelected = mode === materialMode;
          const isElevationMode = materialMode === TileMaterialMode.Dem;
          const isDisabled = isElevationMode && isElevationLoading;
          const title =
            isElevationMode && isElevationLoading
              ? "Loading elevation data"
              : modeLabels[materialMode];

          return (
            <button
              key={materialMode}
              type="button"
              aria-label={
                isDisabled ? title : `Use ${modeLabels[materialMode]} terrain`
              }
              aria-pressed={isSelected}
              disabled={isDisabled}
              title={title}
              onClick={() => {
                const requested = materialMode;

                if (requested === TileMaterialMode.Dem) {
                  void applyElevationMode();
                  return;
                }

                if (applyMaterialMode(requested)) {
                  setMode(requested);
                  setGlobalTileMaterialMode(requested);
                }
              }}
              className={`pointer-events-auto flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium shadow-[0_8px_20px_rgba(0,0,0,0.2)] backdrop-blur-md transition-colors ${
                isSelected
                  ? "border-sky-300/70 bg-sky-400/20 text-white"
                  : "border-white/10 bg-slate-950/75 text-slate-300 hover:border-white/25 hover:bg-slate-900/90 hover:text-white"
              } disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-slate-950/45 disabled:text-slate-600 disabled:shadow-none`}
            >
              <MaterialModeIcon mode={materialMode} />
              <span className="whitespace-nowrap">
                {modeLabels[materialMode]}
              </span>
            </button>
          );
        })}
      </>
    );
  },
);

const materialModeIcons: Record<TileMaterialMode, () => ReactNode> = {
  [TileMaterialMode.Basic]: () => (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="m4 8 8-4 8 4-8 4-8-4Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="m4 12 8 4 8-4M4 16l8 4 8-4"
      />
    </svg>
  ),
  [TileMaterialMode.Dem]: () => <MaterialModeElevationIcon />,
  [TileMaterialMode.Clean]: () => (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M12 3 14 9l6 2-6 2-2 8-2-8-6-2 6-2 2-6Z"
      />
    </svg>
  ),
  [TileMaterialMode.Debug]: () => (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M5 5h14v14H5zM9 5v14M5 9h14M15 5v14M5 15h14"
      />
    </svg>
  ),
  [TileMaterialMode.ShanshuiWash]: () => (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M4 16c3-7 6-7 8 0s5 7 8 0"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M4 11c3-7 6-7 8 0s5 7 8 0"
      />
    </svg>
  ),
};

function MaterialModeElevationIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="m3 18 5-6 3 3 4-7 6 10H3Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M16 5h5M18.5 3.5v3"
      />
    </svg>
  );
}

function MaterialModeIcon({ mode }: { mode: TileMaterialMode }) {
  return materialModeIcons[mode]();
}
