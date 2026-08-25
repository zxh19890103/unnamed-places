import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { createSceneState, SceneState } from "./explore/setup";
import { SceneMonitor } from "./explore/dom/SceneMonitor";
import { TileMaterialModeSelect } from "./explore/dom/TileMaterialModeSelect";
import { OpsPanel } from "./explore/dom/OpsPanel";
import type { LatLng } from "./calc/types";
import { SphereTile } from "./explore/SphereTile.class";
import { buildFlatModalUrl, FLAT_CENTER_CONFIRMED } from "./flat/protocol";
import { JourneyPanel } from "./photos/JourneyPanel";
import { buildJourneyDays } from "./photos/journey";
import { fetchGeotaggedPhotos } from "./photos/sources";
import type { JourneyDayNode, PhotoRecord } from "./photos/types";
import { MiniMap } from "./explore/dom/MiniMap";
import { ChildWindow } from "./_components";
import { latlngToSphere } from "./_3dtiles";
import { EARTH_RADIUS } from "./calc/constants";

type OrbitClickEvent = {
  type: "click";
  latlng: LatLng;
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
            void moveCameraTo(center);
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

    const moveCameraTo = async (to: LatLng) => {
      const alt = sceneState.camera.position.length() - EARTH_RADIUS;
      const position = latlngToSphere(to.lat, to.lng, alt);
      sceneState.camera.position.copy(position);
    };

    return (
      <>
        <div className=" p-2 pointer-events-none fixed inset-x-3 top-3 z-40 flex flex-nowrap justify-center overflow-x-auto">
          <TileMaterialModeSelect
            controls={sceneState.controlsManager}
            tileManager={sceneState.tileManager}
            getCurrentGroundCenter={sceneState.getCurrentGroundCenterLatLng}
            setVisibleTilesElevationRange={
              sceneState.setVisibleTilesElevationRange
            }
          />
        </div>

        <div className="fixed left-3 top-3 z-40">
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

        <div className=" pointer-events-none fixed top-1/2 right-3 z-40 -translate-y-1/2">
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
        </div>

        <div className="fixed bottom-3 left-3 z-40">
          <SceneMonitor
            sphere={sceneState.sphere}
            threeJsStats={sceneState.stats}
          />
        </div>

        {isFlatModalOpen && (
          <ChildWindow.Modal onClose={setIsFlatModalOpen}>
            <ChildWindow
              title="Flat map selector"
              winRole="choose location"
              pageUrl={flatFrameUrl}
              onOpenStateChange={setIsFlatModalOpen}
            />
          </ChildWindow.Modal>
        )}

        {isJobsManageModalOpen && (
          <ChildWindow.Modal onClose={setIsJobsManageModalOpen}>
            <ChildWindow
              title="Jobs manager"
              winRole="manage jobs"
              pageUrl={jobsManageFrameUrl}
              onOpenStateChange={setIsJobsManageModalOpen}
            />
          </ChildWindow.Modal>
        )}

        {isCreateJobModalOpen && (
          <ChildWindow.Modal
            closeSignal={false}
            onClose={setIsCreateJobModalOpen}
          >
            <ChildWindow
              title="Create OSM tile job"
              winRole="create job"
              pageUrl={createJobFrameUrl}
              onOpenStateChange={setIsCreateJobModalOpen}
            />
          </ChildWindow.Modal>
        )}

        {tile12OsmFrameUrl && (
          <ChildWindow.Modal
            size={96}
            closeSignal={null}
            onClose={setTile12OsmFrameUrl}
          >
            <ChildWindow
              title="Check Tile Osm"
              winRole="tile osm"
              pageUrl={tile12OsmFrameUrl as string}
              onOpenStateChange={setTile12OsmFrameUrl}
            />
          </ChildWindow.Modal>
        )}

        <div className="fixed top-3 right-2 z-50">
          <MiniMap
            controls={sceneState.controlsManager}
            positionGetter={sceneState.getCurrentCenterLatLng}
            precision={9}
          />
        </div>
      </>
    );
  },
);
