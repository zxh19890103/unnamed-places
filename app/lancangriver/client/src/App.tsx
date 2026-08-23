import { memo, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import * as THREE from "three";
import * as Tooltip from "@radix-ui/react-tooltip";

import {
  createSceneState,
  setGlobalTileMaterialMode,
  globalTileMaterialMode,
  SceneState,
} from "./explore/setup";
import { SceneMonitor } from "./explore/dom/SceneMonitor";
import type { LatLng } from "./calc/types";
import { buildFlatModalUrl, FLAT_CENTER_CONFIRMED } from "./flat/protocol";
import { JourneyPanel } from "./photos/JourneyPanel";
import { buildJourneyDays } from "./photos/journey";
import { fetchGeotaggedPhotos } from "./photos/sources";
import type { JourneyDayNode, PhotoRecord } from "./photos/types";
import type { TilesManager } from "./explore/TilesManager.class";
import type { LatLngBBox } from "./explore/setup/coverageVisibility";
import { BASE_URL, ELEVATION_SCALE } from "./calc/constants";
import { SphereTile, TileMaterialMode } from "./explore/SphereTile.class";
import {
  Create3dTilesViewer,
  useCurrentThreeDTilesViewerState,
} from "./experiments/sphere-zoom/viewer";
import { MiniMap } from "./explore/dom/MiniMap";
import { ControlsManager } from "./explore/ControlsManager.class";
import { latlngToStandardTileZxy } from "./experiments/sphere-zoom/tile";
import { Button, ChildWindow, IconButton } from "./_components";
import clsx from "clsx";

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
    const [tile12OsmFrameUrl, setTile12OsmFrameUrl] = useState<
      string | boolean
    >(null);
    const [isFlatModalOpen, setIsFlatModalOpen] = useState(false);
    const [flatFrameUrl, setFlatFrameUrl] = useState("/flat.html");
    const [isJobsManageModalOpen, setIsJobsManageModalOpen] = useState(false);
    const [jobsManageFrameUrl, setJobsManageFrameUrl] = useState("./jobs");
    const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
    const [createJobFrameUrl, setCreateJobFrameUrl] = useState("./jobs-create");
    const flatModalTriggerRef = useRef<HTMLElement | null>(null);
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

        const eventType = event.data?.type;
        switch (eventType) {
          case FLAT_CENTER_CONFIRMED: {
            const center = event.data.payload as LatLng | undefined;
            void focus3dAtCenter(center);
            break;
          }
          case "tile12osm": {
            const url = event.data.urlToGo;
            setTile12OsmFrameUrl(url);
            break;
          }
        }
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, []);

    useEffect(() => {
      if (!isFlatModalOpen) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setIsFlatModalOpen(false);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        flatModalTriggerRef.current?.focus();
      };
    }, [isFlatModalOpen]);

    const openFlatModal = async () => {
      const center = sceneState.getCurrentCenterLatLng();
      flatModalTriggerRef.current =
        document.activeElement as HTMLElement | null;
      setFlatFrameUrl(buildFlatModalUrl(center));
      setIsFlatModalOpen(true);
    };

    const openJobsManageModal = () => {
      setJobsManageFrameUrl("./jobs");
      setIsJobsManageModalOpen(true);
    };

    const openCreateJobModal = () => {
      const center = sceneState.getCurrentCenterLatLng();
      const nextUrl = center
        ? `./jobs-create?latlng=${center.lat},${center.lng}`
        : "./jobs-create";
      setCreateJobFrameUrl(nextUrl);
      setIsCreateJobModalOpen(true);
    };

    const handleDirectSwitchTo3dView = async () => {
      if (sceneState.threeTilesViewer.state.lookat === "origin") {
        const center = sceneState.getCurrentCenterLatLng();
        focus3dAtCenter(center);
      } else {
        // const target = sceneState.controlsManager.orbitControls.target;
        sceneState.threeTilesViewer.lookAtOrigin();
        sceneState.refreshVisibleTilesOnCameraChanges();
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
        setJourneyError("Could not focus that day");
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
        <div className=" p-2 pointer-events-none fixed inset-x-3 top-3 z-40 flex flex-nowrap justify-start gap-1.5 overflow-x-auto sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:justify-center">
          <TerrianModeSelect
            controls={sceneState.controlsManager}
            tileManager={sceneState.tileManager}
            getCurrentGroundCenter={sceneState.getCurrentGroundCenterLatLng}
            setVisibleTilesElevationRange={
              sceneState.setVisibleTilesElevationRange
            }
          />
        </div>

        <div className="fixed left-3 top-3 z-40 sm:left-4">
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
          onOpenJobsManage={openJobsManageModal}
          onOpenCreateJob={openCreateJobModal}
          handleDirectSwitchTo3dView={handleDirectSwitchTo3dView}
          handleLoadGeotaggedPhotos={handleLoadGeotaggedPhotos}
          getVisibleGroundBBox={sceneState.getVisibleGroundBBox}
          getCurrentLookingAtCenter={sceneState.getCurrentCenterLatLng}
          tileManager={sceneState.tileManager}
          threeTilesViewer={sceneState.threeTilesViewer}
        />

        <div className="fixed bottom-76 left-3 z-30 sm:bottom-3 sm:left-4">
          <SceneMonitor
            sphere={sceneState.sphere}
            threeJsStats={sceneState.stats}
          />
        </div>

        {isFlatModalOpen && (
          <ChildWindow.Modal>
            <ChildWindow
              title="Flat map selector"
              winRole="choose location"
              pageUrl={flatFrameUrl}
              onOpenStateChange={setIsFlatModalOpen}
            />
          </ChildWindow.Modal>
        )}

        {isJobsManageModalOpen && (
          <ChildWindow.Modal>
            <ChildWindow
              title="Jobs manager"
              winRole="manage jobs"
              pageUrl={jobsManageFrameUrl}
              onOpenStateChange={setIsJobsManageModalOpen}
            />
          </ChildWindow.Modal>
        )}

        {isCreateJobModalOpen && (
          <ChildWindow.Modal>
            <ChildWindow
              title="Create OSM tile job"
              winRole="create job"
              pageUrl={createJobFrameUrl}
              onOpenStateChange={setIsCreateJobModalOpen}
            />
          </ChildWindow.Modal>
        )}

        {tile12OsmFrameUrl && (
          <ChildWindow.Modal size={96}>
            <ChildWindow
              title="Check Tile Osm"
              winRole="tile osm"
              pageUrl={tile12OsmFrameUrl as string}
              onOpenStateChange={setTile12OsmFrameUrl}
            />
          </ChildWindow.Modal>
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
  onOpenJobsManage: () => void;
  onOpenCreateJob: () => void;
  handleDirectSwitchTo3dView: () => Promise<void>;
  handleLoadGeotaggedPhotos: () => Promise<void>;
  getVisibleGroundBBox: () => LatLngBBox | null;
  getCurrentLookingAtCenter: () => LatLng | null;
  tileManager: TilesManager;
  threeTilesViewer: Create3dTilesViewer;
};

const OpsPanel = ({
  openFlatModal,
  onOpenJobsManage,
  onOpenCreateJob,
  handleDirectSwitchTo3dView,
  handleLoadGeotaggedPhotos,
  getCurrentLookingAtCenter,
  tileManager,
  threeTilesViewer,
}: OpsPanelProps) => {
  const state = useCurrentThreeDTilesViewerState("zoomLevel");
  console.log("state.zoomls", state);

  const [viewerUpdateEnabled, setViewerUpdateEnabled] = useState(
    !tileManager.frozen,
  );

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
      <div
        className="pointer-events-none fixed top-1/2 right-3 z-40 flex -translate-y-1/2 flex-col gap-2 sm:right-4"
        role="toolbar"
        aria-label="Scene controls"
        aria-orientation="vertical"
      >
        <SceneControlTooltip
          label={
            viewerUpdateEnabled ? "Pause tile updates" : "Resume tile updates"
          }
        >
          <IconButton
            aria-label={
              viewerUpdateEnabled ? "Pause tile updates" : "Resume tile updates"
            }
            aria-pressed={!viewerUpdateEnabled}
            onClick={() => {
              const nextFrozen = !tileManager.frozen;
              tileManager.frozen = nextFrozen;
              const nextUpdateEnabled = !nextFrozen;
              setViewerUpdateEnabled(nextUpdateEnabled);
            }}
            className={`pointer-events-auto ${
              viewerUpdateEnabled
                ? ""
                : "border-jade-river bg-jade-river-soft text-jade-text"
            }`}
          >
            {viewerUpdateEnabled ? <PauseTilesIcon /> : <ResumeTilesIcon />}
          </IconButton>
        </SceneControlTooltip>
        <SceneControlTooltip label="Open flat map">
          <IconButton
            type="button"
            aria-label="Open flat map"
            onClick={() => void openFlatModal()}
            className={`pointer-events-auto`}
          >
            <FlatMapIcon />
          </IconButton>
        </SceneControlTooltip>
        <SceneControlTooltip label="Switch top-down / perspective view">
          <IconButton
            type="button"
            aria-label="Switch top-down or perspective view"
            onClick={() => void handleDirectSwitchTo3dView()}
            className={`pointer-events-auto`}
          >
            <ViewAngleIcon />
          </IconButton>
        </SceneControlTooltip>
        <SceneControlTooltip label="Load photo locations">
          <IconButton
            type="button"
            aria-label="Load photo locations"
            onClick={() => void handleLoadGeotaggedPhotos()}
            className={`pointer-events-auto`}
          >
            <PhotoLocationsIcon />
          </IconButton>
        </SceneControlTooltip>
        <SceneControlTooltip label="Open jobs manager">
          <IconButton
            type="button"
            aria-label="Open jobs manager"
            onClick={() => onOpenJobsManage()}
            className={`pointer-events-auto`}
          >
            <JobsManageIcon />
          </IconButton>
        </SceneControlTooltip>
        <SceneControlTooltip label="Create OSM tile job">
          <IconButton
            type="button"
            aria-label="Create OSM tile job"
            onClick={() => onOpenCreateJob()}
            className={`pointer-events-auto`}
          >
            <CreateTileJobIcon />
          </IconButton>
        </SceneControlTooltip>
      </div>
    </Tooltip.Provider>
  );
};

function SceneControlTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="left"
          align="center"
          sideOffset={10}
          className="z-2000 rounded-lg px-3 py-2 text-xs font-medium text-white shadow-xl shadow-[#182a36]/20 select-none"
        >
          {label}
          {/* <Tooltip.Arrow className="fill-jade-panel-raised" /> */}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const iconClass = "size-5.5";

function PauseTilesIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z" />
        <path d="m3.5 11 8.5 4 8.5-4M3.5 15l8.5 4 3.5-1.65" opacity=".65" />
        <path d="M18 15.5v5M21 15.5v5" strokeWidth="2.2" />
      </g>
    </svg>
  );
}

function ResumeTilesIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z" />
        <path d="m3.5 11 8.5 4 8.5-4M3.5 15l8.5 4 3.5-1.65" opacity=".65" />
      </g>
      <path d="m17 15 4 2.75-4 2.75V15Z" fill="currentColor" />
    </svg>
  );
}

function FlatMapIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <path d="m3 5 5-2 8 3 5-2v15l-5 2-8-3-5 2V5Z" />
        <path d="M8 3v15M16 6v4" opacity=".7" />
        <path d="M19 13.5c0 2-3 5-3 5s-3-3-3-5a3 3 0 1 1 6 0Z" />
        <circle cx="16" cy="13.5" r=".8" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

function ViewAngleIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <path d="m3 16 9-4 9 4-9 4-9-4Z" />
        <path d="M12 3v7M9.5 5.5 12 3l2.5 2.5" />
        <path d="M5 12.5 8.5 9M5 9v3.5h3.5" opacity=".8" />
      </g>
    </svg>
  );
}

function PhotoLocationsIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <rect x="3" y="5.5" width="14" height="12" rx="2" />
        <path d="m5.5 15 3.5-3 2.5 2 2-1.5 3.5 3M7 5.5l1-2h4l1 2" />
        <circle cx="13" cy="9.5" r="1.4" />
        <path
          d="M22 15.5c0 2-3 5-3 5s-3-3-3-5a3 3 0 1 1 6 0Z"
          fill="var(--jade-panel)"
        />
        <circle cx="19" cy="15.5" r=".8" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

function CreateTileJobIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <path d="M4 5.5h16" />
        <path d="M7 3.5v4" />
        <path d="M17 3.5v4" />
        <rect x="4" y="5.5" width="16" height="13" rx="2" />
        <path d="M8 13.5h8" />
        <path d="M12 9.5v8" />
      </g>
    </svg>
  );
}

function JobsManageIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </g>
    </svg>
  );
}

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
    const zoomLevel = useCurrentThreeDTilesViewerState("zoomLevel");
    console.log("zoml", zoomLevel);

    const [mode, setMode] = useState(globalTileMaterialMode);
    const [isElevationLoading, setIsElevationLoading] = useState(false);

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
        {Object.values(TileMaterialMode).map((materialMode) => {
          const isSelected = mode === materialMode;
          const isElevationMode = materialMode === TileMaterialMode.Dem;
          const isZoomBlocked = isElevationMode && zoomLevel < 11;
          const isDisabled =
            isZoomBlocked || (isElevationMode && isElevationLoading);
          const title = isElevationLoading
            ? "Loading elevation data"
            : isZoomBlocked
              ? "Zoom in past level 11 to use elevation terrain"
              : modeLabels[materialMode];

          return (
            <Button
              key={materialMode}
              aria-label={
                isDisabled ? title : `Use ${modeLabels[materialMode]} terrain`
              }
              aria-pressed={isSelected}
              disabled={isDisabled}
              title={title}
              className={clsx(
                " pointer-events-auto",
                isSelected ? " relative top-1" : null,
              )}
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
            >
              <MaterialModeIcon mode={materialMode} />
              <span className="whitespace-nowrap">
                {modeLabels[materialMode]}
              </span>
            </Button>
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
