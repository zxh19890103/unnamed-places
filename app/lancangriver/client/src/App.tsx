import { useEffect, useRef, useState } from "react";

import { createScene } from "./explore/setup";
import { SceneMonitor } from "./explore/dom/SceneMonitor";
import type { LatLng } from "./calc/types";
import type { Sphere } from "./explore/Sphere.class";
import { buildFlatModalUrl, FLAT_CENTER_CONFIRMED } from "./flat/protocol";
import { JourneyPanel } from "./photos/JourneyPanel";
import { buildJourneyDays } from "./photos/journey";
import { fetchGeotaggedPhotos } from "./photos/sources";
import {
  enqueueCoverageJob,
  fetchCoverageStatus,
  fetchCoverageStatusHighways,
  highwaysCoverageApi,
  rerunFailedCoverageJob,
  rerunFailedCoverageJobHighways,
  type CoverageStatusResponse,
} from "./jobs/api";
import type { JourneyDayNode, PhotoRecord } from "./photos/types";
import type { TilesManager } from "./explore/TilesManager.class";
import type { VisibleCoverageTile } from "./explore/setup/coverageVisibility";

type CoverageModalState = {
  tiles: VisibleCoverageTile[];
  sampledAt: number;
  paddingPx: number;
};

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
  const [tileManager, setTileManager] = useState<TilesManager | null>(null);
  const [coverageModal, setCoverageModal] = useState<CoverageModalState | null>(
    null,
  );

  const currentCenterGetterRef = useRef<null | (() => LatLng)>(null);
  const focusGroundOrbitAtLatLngRef = useRef<
    null | ((centerLatlng: LatLng) => Promise<any>)
  >(null);
  const getVisibleCoverageTilesRef = useRef<
    | null
    | ((options?: {
        paddingPx?: number;
        sampleStepPx?: number;
      }) => VisibleCoverageTile[])
  >(null);
  const showPhotosLocationsRef = useRef<(...args: any[]) => void>(null);

  const focus3dAtCenter = async (center: LatLng | null | undefined) => {
    if (!center) {
      return;
    }

    if (!focusGroundOrbitAtLatLngRef.current) {
      return;
    }

    await focusGroundOrbitAtLatLngRef.current(center);
    setIsFlatModalOpen(false);
  };

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
      resize,
      getCurrentCenterLatLng,
      getVisibleCoverageTiles,
      focusGroundOrbitAtLatLng,
      destroyCameraGui,
      destroyStats,
      showPhotosLocations,
      onFrame,
      cleanup,
      tileManager: sceneTileManager,
    } = createScene(host);

    currentCenterGetterRef.current = getCurrentCenterLatLng;
    focusGroundOrbitAtLatLngRef.current = focusGroundOrbitAtLatLng;
    getVisibleCoverageTilesRef.current = getVisibleCoverageTiles;
    showPhotosLocationsRef.current = showPhotosLocations;
    setTileManager(sceneTileManager);

    setSphere(sceneSphere);

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

    return () => {
      currentCenterGetterRef.current = null;
      focusGroundOrbitAtLatLngRef.current = null;
      getVisibleCoverageTilesRef.current = null;
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(frameId);
      destroyCameraGui();
      destroyStats();
      cleanup();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      setSphere(null);
      setTileManager(null);
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

      void focus3dAtCenter(center);
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

  const handleDirectSwitchTo3dView = async () => {
    const center = currentCenterGetterRef.current
      ? await currentCenterGetterRef.current()
      : null;

    await focus3dAtCenter(center);
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

  const handleLoadCentralTileZ12Osm = async () => {
    try {
      if (!getVisibleCoverageTilesRef.current) {
        return;
      }

      const paddingPx = 48;
      const visibleTiles = getVisibleCoverageTilesRef.current({
        paddingPx,
        sampleStepPx: 56,
      });

      if (visibleTiles.length === 0) {
        alert("No visible z12 coverage tiles were detected in the viewport");
        return;
      }

      setCoverageModal({
        tiles: visibleTiles,
        sampledAt: Date.now(),
        paddingPx,
      });

      console.log("Opened viewport z12 OSM coverage modal", {
        visibleTiles: visibleTiles.length,
      });
    } catch (error) {
      console.warn("Failed to list viewport z12 OSM jobs", error);
      alert("Failed to list viewport OSM jobs");
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

      {tileManager && (
        <OpsPanel
          openFlatModal={openFlatModal}
          handleDirectSwitchTo3dView={handleDirectSwitchTo3dView}
          handleLoadGeotaggedPhotos={handleLoadGeotaggedPhotos}
          handleLoadVisibleTilesZ12Osm={handleLoadCentralTileZ12Osm}
          tileManager={tileManager}
        />
      )}

      {coverageModal && (
        <CoverageJobModal
          coverageModal={coverageModal}
          onClose={() => setCoverageModal(null)}
        />
      )}

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

type OpsPanelProps = {
  openFlatModal: () => Promise<void>;
  handleDirectSwitchTo3dView: () => Promise<void>;
  handleLoadGeotaggedPhotos: () => Promise<void>;
  handleLoadVisibleTilesZ12Osm: () => Promise<void>;
  tileManager: TilesManager;
};

const OpsPanel = ({
  openFlatModal,
  handleDirectSwitchTo3dView,
  handleLoadGeotaggedPhotos,
  handleLoadVisibleTilesZ12Osm,
  tileManager,
}: OpsPanelProps) => {
  const [viewerUpdateEnabled, setViewerUpdateEnabled] = useState(
    !tileManager.frozen,
  );

  return (
    <div className="fixed right-4 bottom-3  z-40 ">
      <div className=" flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            const nextFrozen = !tileManager.frozen;
            tileManager.frozen = nextFrozen;
            const nextUpdateEnabled = !nextFrozen;
            setViewerUpdateEnabled(nextUpdateEnabled);
          }}
          className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900"
        >
          {viewerUpdateEnabled ? "Pause Update" : "Resume Update"}
        </button>
        <button
          type="button"
          onClick={() => void openFlatModal()}
          className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900"
        >
          Open flat map
        </button>
        <button
          type="button"
          onClick={() => void handleDirectSwitchTo3dView()}
          className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900"
        >
          Direct 3D recenter
        </button>
        <button
          type="button"
          onClick={() => void handleLoadGeotaggedPhotos()}
          className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900"
        >
          Load geotagged photos
        </button>
        <button
          type="button"
          onClick={() => void handleLoadVisibleTilesZ12Osm()}
          className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900"
        >
          load viewport tiles z12 osm
        </button>
      </div>
    </div>
  );
};

type CoverageJobModalProps = {
  coverageModal: CoverageModalState;
  onClose: () => void;
};

type CoverageTarget = "osm" | "highways";

type CoverageModalRow = CoverageModalState["tiles"][number] & {
  rowId: string;
  target: CoverageTarget;
  loading: boolean;
  rerunning: boolean;
  enqueuing: boolean;
  error: string | null;
  status: CoverageStatusResponse["status"];
  loaded: boolean;
  enqueueState: "idle" | "queued" | "already-exists";
};

const CoverageJobModal = ({
  coverageModal,
  onClose,
}: CoverageJobModalProps) => {
  const { tiles, sampledAt, paddingPx } = coverageModal;
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const copiedKeyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const buildRows = (
    sourceTiles: VisibleCoverageTile[],
  ): CoverageModalRow[] => {
    return sourceTiles.flatMap((tile) => {
      const base = {
        ...tile,
        loading: true,
        rerunning: false,
        enqueuing: false,
        error: null,
        status: null,
        loaded: false,
        enqueueState: "idle" as const,
      };

      return [
        {
          ...base,
          rowId: `osm:${tile.key}`,
          target: "osm" as const,
        },
        {
          ...base,
          rowId: `highways:${tile.key}`,
          target: "highways" as const,
        },
      ];
    });
  };

  const [rows, setRows] = useState<CoverageModalRow[]>(() => buildRows(tiles));

  const patchRow = (rowId: string, patch: Partial<CoverageModalRow>) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.rowId === rowId ? { ...row, ...patch } : row,
      ),
    );
  };

  const fetchStatusByTarget = async (row: CoverageModalRow) => {
    if (row.target === "highways") {
      return fetchCoverageStatusHighways(row.x, row.y);
    }

    return fetchCoverageStatus(row.x, row.y);
  };

  const enqueueByTarget = async (row: CoverageModalRow) => {
    if (row.target === "highways") {
      return highwaysCoverageApi.enqueueCoverageJob(row.x, row.y);
    }

    return enqueueCoverageJob(row.x, row.y);
  };

  const rerunByTarget = async (row: CoverageModalRow) => {
    if (row.target === "highways") {
      return rerunFailedCoverageJobHighways(row.x, row.y);
    }

    return rerunFailedCoverageJob(row.x, row.y);
  };

  const refreshRowStatus = async (row: CoverageModalRow) => {
    patchRow(row.rowId, { loading: true, error: null });

    try {
      const response = await fetchStatusByTarget(row);
      patchRow(row.rowId, {
        loading: false,
        status: response.status,
        loaded: response.loaded,
      });
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError);

      patchRow(row.rowId, {
        loading: false,
        error: message,
      });
    }
  };

  const refreshAllStatuses = async () => {
    await Promise.all(rows.map((row) => refreshRowStatus(row)));
  };

  const rerunRowJob = async (row: CoverageModalRow) => {
    if (row.status !== "failed") {
      return;
    }

    patchRow(row.rowId, { rerunning: true, error: null });

    try {
      const response = await rerunByTarget(row);
      patchRow(row.rowId, {
        rerunning: false,
        status: response.status,
        loaded: false,
      });
    } catch (rerunError) {
      const message =
        rerunError instanceof Error ? rerunError.message : String(rerunError);

      patchRow(row.rowId, {
        rerunning: false,
        error: message,
      });
    }
  };

  const enqueueRowJob = async (row: CoverageModalRow) => {
    patchRow(row.rowId, { enqueuing: true, error: null });

    try {
      const response = await enqueueByTarget(row);
      patchRow(row.rowId, {
        enqueuing: false,
        enqueueState: response.enqueued ? "queued" : "already-exists",
      });

      await refreshRowStatus(row);
    } catch (enqueueError) {
      const message =
        enqueueError instanceof Error
          ? enqueueError.message
          : String(enqueueError);

      patchRow(row.rowId, {
        enqueuing: false,
        error: message,
      });
    }
  };

  const copyTileKey = async (rowId: string, key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedRowId(rowId);

      if (copiedKeyTimeoutRef.current) {
        clearTimeout(copiedKeyTimeoutRef.current);
      }

      copiedKeyTimeoutRef.current = setTimeout(() => {
        setCopiedRowId((current) => (current === rowId ? null : current));
      }, 1200);
    } catch (copyError) {
      console.warn("Failed to copy tile key", copyError);
    }
  };

  useEffect(() => {
    const seededRows = buildRows(tiles);

    setRows(seededRows);

    void Promise.all(seededRows.map((row) => refreshRowStatus(row)));
  }, [sampledAt, tiles]);

  useEffect(() => {
    return () => {
      if (copiedKeyTimeoutRef.current) {
        clearTimeout(copiedKeyTimeoutRef.current);
      }
    };
  }, []);

  const queuedCount = rows.filter(
    (row) => row.enqueueState === "queued",
  ).length;
  const existingCount = rows.filter(
    (row) => row.enqueueState === "already-exists",
  ).length;

  return (
    <div className="absolute inset-0 z-1995 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
      <div className="relative w-[min(980px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Zoom-12 OSM coverage
              </div>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                Visible viewport tiles
              </h2>
              <div className="mt-1 text-sm text-slate-600">
                {rows.length} tiles | padding {paddingPx}px
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div>
              {tiles.length} visible tiles. {rows.length} jobs (OSM + Highways).{" "}
              {queuedCount} queued from this modal, {existingCount} already
              existed.
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Only keys found through viewport rays and frustum overlap are
              listed.
            </div>
          </div>

          <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Key</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Loaded</th>
                  <th className="px-3 py-2 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowId}
                    className="border-t border-slate-200 align-top"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-800">
                      <button
                        type="button"
                        onClick={() => void copyTileKey(row.rowId, row.key)}
                        className="rounded border border-transparent px-1 py-0.5 text-left text-xs text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
                        title="Copy tile key"
                        aria-label={`Copy tile key ${row.key}`}
                      >
                        {row.key}
                      </button>
                      {copiedRowId === row.rowId ? (
                        <div className="mt-1 text-[11px] text-emerald-700">
                          copied
                        </div>
                      ) : null}
                      <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                        {row.target === "osm" ? "OSM" : "Highways"}
                      </div>
                      {row.enqueueState !== "idle" ? (
                        <div className="mt-1 text-[11px] text-slate-500">
                          {row.enqueueState === "queued"
                            ? "queued now"
                            : "already existed"}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className={`inline-flex rounded border px-2 py-1 text-xs font-semibold uppercase ${
                          row.status === "queued"
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : row.status === "running"
                              ? "border-sky-300 bg-sky-50 text-sky-800"
                              : row.status === "done"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : row.status === "failed"
                                  ? "border-rose-300 bg-rose-50 text-rose-800"
                                  : "border-slate-300 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.loading ? "loading" : (row.status ?? "none")}
                      </div>
                      {row.error ? (
                        <div className="mt-1 text-xs text-rose-700">
                          {row.error}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.loading ? "..." : row.loaded ? "yes" : "no"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={row.enqueuing}
                          onClick={() => void enqueueRowJob(row)}
                          className="rounded border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-50"
                        >
                          {row.enqueuing ? "Enqueuing" : "Enqueue"}
                        </button>
                        <button
                          type="button"
                          disabled={row.loading}
                          onClick={() => void refreshRowStatus(row)}
                          className="rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50"
                        >
                          Refresh
                        </button>
                        <button
                          type="button"
                          disabled={row.rerunning || row.status !== "failed"}
                          onClick={() => void rerunRowJob(row)}
                          className="rounded border border-rose-700 bg-rose-700 px-2 py-1 text-xs font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {row.rerunning ? "Rerunning" : "Rerun"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshAllStatuses()}
              className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Refresh all statuses
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
