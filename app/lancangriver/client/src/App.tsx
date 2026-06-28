import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { createScene } from "./explore/setup";
import { SceneMonitor } from "./explore/dom/SceneMonitor";
import type { LatLng } from "./calc/types";
import type { Sphere } from "./explore/Sphere.class";
import type { TileNode } from "./explore/TilesManager.class";
import { buildFlatModalUrl, FLAT_CENTER_CONFIRMED } from "./flat/protocol";
import { JourneyPanel } from "./photos/JourneyPanel";
import { buildJourneyDays } from "./photos/journey";
import { fetchGeotaggedPhotos } from "./photos/sources";
import type { JourneyDayNode, PhotoRecord } from "./photos/types";

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sphere, setSphere] = useState<Sphere | null>(null);
  const [isFlatModalOpen, setIsFlatModalOpen] = useState(false);
  const [flatFrameUrl, setFlatFrameUrl] = useState("/flat.html");
  const [journeyDays, setJourneyDays] = useState<JourneyDayNode[]>([]);
  const [journeyRecords, setJourneyRecords] = useState<PhotoRecord[]>([]);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  const currentCenterGetterRef = useRef<null | (() => Promise<LatLng>)>(null);
  const focusGroundOrbitAtLatLngRef = useRef<
    null | ((centerLatlng: LatLng) => Promise<void>)
  >(null);
  const showPhotosLocationsRef = useRef<(...args: any[]) => void>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const {
      scene,
      camera,
      renderer,
      controlsManager,
      sphere: sceneSphere,
      stats,
      tileManager,
      compositor,
      resize,
      getCurrentCenterLatLng,
      focusGroundOrbitAtLatLng,
      destroyCameraGui,
      destroyStats,
      showPhotosLocations,
      cleanup,
    } = createScene(host);

    currentCenterGetterRef.current = getCurrentCenterLatLng;
    focusGroundOrbitAtLatLngRef.current = focusGroundOrbitAtLatLng;
    showPhotosLocationsRef.current = showPhotosLocations;

    setSphere(sceneSphere);

    const handleResize = () => resize();
    window.addEventListener("resize", handleResize);

    let frameId = 0;
    let lastTime = performance.now();
    let lastCompositorUpdate = 0;
    const centerRaycaster = new THREE.Raycaster();
    const centerNdc = new THREE.Vector2(0, 0);

    const getCenterLookedTileNode = (
      attachedNodes: TileNode[],
    ): TileNode | null => {
      const tileMeshes: THREE.Object3D[] = [];
      const meshToNode = new Map<THREE.Object3D, TileNode>();

      for (const node of attachedNodes) {
        if (!node.tile) {
          continue;
        }

        tileMeshes.push(node.tile);
        meshToNode.set(node.tile, node);
      }

      if (tileMeshes.length === 0) {
        return null;
      }

      centerRaycaster.setFromCamera(centerNdc, camera);
      const hits = centerRaycaster.intersectObjects(tileMeshes, false);

      for (const hit of hits) {
        const node = meshToNode.get(hit.object);
        if (node) {
          return node;
        }
      }

      return null;
    };

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.016); // Cap at 16ms
      lastTime = now;

      controlsManager.update(delta);

      // Update compositor when tiles are frozen (fly or groundOrbit mode), throttled
      if (tileManager.frozen && now - lastCompositorUpdate > 300) {
        const attachedNodes = tileManager.getAttachedNodes();
        const lookedAtNode = getCenterLookedTileNode(attachedNodes);

        const tilesToCompose = attachedNodes
          .filter((node) => node.tile)
          .map((node) => {
            return {
              node,
              tile: node.tile!,
              // for testing
              cameraDistance: node === lookedAtNode ? 11_000 : 31_000,
            };
          })
          .sort((a, b) => {
            if (a.node === lookedAtNode) {
              return -1;
            }
            if (b.node === lookedAtNode) {
              return 1;
            }
            return 0;
          });

        if (tilesToCompose.length > 0) {
          void compositor.updateForTiles(tilesToCompose);
        }

        lastCompositorUpdate = now;
      }

      stats.update();
      renderer.render(scene, camera);
    };

    resize();
    animate();

    return () => {
      currentCenterGetterRef.current = null;
      focusGroundOrbitAtLatLngRef.current = null;
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(frameId);
      destroyCameraGui();
      destroyStats();
      cleanup();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      setSphere(null);
    };
  }, []);

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

      if (!center) {
        return;
      }

      if (!focusGroundOrbitAtLatLngRef.current) {
        return;
      }

      void focusGroundOrbitAtLatLngRef.current(center);

      setIsFlatModalOpen(false);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const openFlatModal = async () => {
    const center = currentCenterGetterRef.current
      ? await currentCenterGetterRef.current()
      : null;

    setFlatFrameUrl(buildFlatModalUrl(center));
    setIsFlatModalOpen(true);
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
    if (!selectedDay || !focusGroundOrbitAtLatLngRef.current) {
      return;
    }

    try {
      await focusGroundOrbitAtLatLngRef.current({
        lat: selectedDay.representativeLat,
        lng: selectedDay.representativeLng,
      });

      showPhotosLocationsRef.current(selectedDay, journeyRecords);
    } catch (error) {
      console.warn("Failed to focus journey day", error);
    }
  };

  return (
    <div className="relative h-screen w-screen">
      <div ref={hostRef} className="absolute inset-0 overflow-hidden" />

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

      <div className="fixed right-4 bottom-3  z-40 ">
        <div className=" flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void openFlatModal()}
            className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900"
          >
            Open flat map
          </button>
          <button
            type="button"
            onClick={() => void handleLoadGeotaggedPhotos()}
            className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900"
          >
            Load geotagged photos
          </button>
        </div>
      </div>

      <div className="fixed bottom-3 left-4 z-30 ">
        <SceneMonitor sphere={sphere} />
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
    </div>
  );
}
