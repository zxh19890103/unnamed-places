import { memo, useEffect, useMemo, useRef, useState } from "react";
import { LeafletBBoxMap } from "./map.js";
import { readBBoxFromSearch, readLatLngFromSearch, type BBox } from "./bbox.js";
import { coverageTilesForBBox, TileKey } from "./tiles.js";
import {
  enqueueCoverageJob,
  enqueueCoverageJobHighways,
  fetchCoverageStatus,
  fetchCoverageStatusHighways,
} from "../jobs/api.js";

const COVERAGE_ZOOM = 12;

export default function App() {
  const bbox = useMemo(() => readBBoxFromSearch(window.location.search), []);
  const latlng = useMemo(
    () => readLatLngFromSearch(window.location.search),
    [],
  );
  const [visibleBounds, setVisibleBounds] = useState<BBox>(bbox);
  const [focusTile, setFocusTile] = useState<string | null>(null);

  const tiles = useMemo(
    () => coverageTilesForBBox(visibleBounds, COVERAGE_ZOOM),
    [visibleBounds],
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <main className="h-full flex-1">
        <LeafletBBoxMap
          focusTile={focusTile}
          bbox={bbox}
          latlng={latlng}
          onBoundsChange={setVisibleBounds}
        />
      </main>

      <aside className="flex h-full w-80 flex-col border-l border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-wide text-slate-900">
            Zoom {COVERAGE_ZOOM} Coverage
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {tiles.length === 0
              ? "Visible map exceeds 30km, zoom in to list tiles"
              : `${tiles.length} tile${tiles.length === 1 ? "" : "s"} cover the visible map`}
          </p>
        </header>
        <TileList
          tiles={tiles}
          focusTile={focusTile}
          onTileClick={setFocusTile}
        />
      </aside>
    </div>
  );
}

const TileList = ({ tiles, focusTile, onTileClick }) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const leafletTileContainer = document.querySelector(
      ".leaflet-tile-container",
    );

    elementRef.current.addEventListener("click", (event) => {
      // if it is the button of itemtype = `where?`, trigger
      const target = event.target as HTMLElement;
      const button = target.closest('button[itemtype="tile/where"]');

      console.log(button);

      if (button) {
        const id = button.getAttribute("itemid");
        onTileClick(id);
      }
    });
  }, [onTileClick]);

  return (
    <div ref={elementRef} className="flex-1 overflow-y-auto bg-slate-50">
      <ul className="flex flex-col gap-2 px-3 py-3">
        {tiles.map((tile) => (
          <TileListItem
            focused={focusTile === tile.id}
            key={tile.id}
            tile={tile}
          />
        ))}
      </ul>
    </div>
  );
};

const TileListItem = memo(
  ({ focused, tile }: { focused: boolean; tile: TileKey }) => {
    const [downloadStatus, setDownloadStatus] = useState<
      "idle" | "queuing" | "queued" | "error"
    >("idle");
    const [highwayDownloadStatus, setHighwayDownloadStatus] = useState<
      "idle" | "queuing" | "queued" | "error"
    >("idle");
    const [statusDialogInfo, setStatusDialogInfo] = useState<{
      label: string;
      statusText?: string;
      loadedText?: string;
      errorText?: string;
    } | null>(null);
    const statusDialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
      if (statusDialogInfo) {
        statusDialogRef.current?.showModal();
      } else {
        statusDialogRef.current?.close();
      }
    }, [statusDialogInfo]);

    const handleDownloadOsm = async () => {
      setDownloadStatus("queuing");
      try {
        await enqueueCoverageJob(tile.x, tile.y);
        setDownloadStatus("queued");
      } catch (error) {
        console.warn("Failed to enqueue OSM coverage job", tile, error);
        setDownloadStatus("error");
      }
    };

    const handleDownloadHighwayOsm = async () => {
      setHighwayDownloadStatus("queuing");
      try {
        await enqueueCoverageJobHighways(tile.x, tile.y);
        setHighwayDownloadStatus("queued");
      } catch (error) {
        console.warn("Failed to enqueue highway OSM coverage job", tile, error);
        setHighwayDownloadStatus("error");
      }
    };

    const handleCheckStatus = async (kind: "buildings" | "highways") => {
      const label = kind === "buildings" ? "Buildings & waters" : "Highways";

      try {
        const result =
          kind === "buildings"
            ? await fetchCoverageStatus(tile.x, tile.y)
            : await fetchCoverageStatusHighways(tile.x, tile.y);

        const statusText = result.status ?? "no job queued yet";
        const loadedText = result.loaded
          ? "yes, data is loaded in the database"
          : "no, not loaded yet";

        setStatusDialogInfo({ label, statusText, loadedText });
      } catch (error) {
        console.warn(`Failed to check ${kind} coverage status`, tile, error);
        setStatusDialogInfo({
          label,
          errorText: "Could not check status. See console for details.",
        });
      }
    };

    return (
      <li
        key={`${tile.z}/${tile.x}/${tile.y}`}
        className={
          "rounded-xl border bg-white p-3 text-xs shadow-sm transition-shadow hover:shadow-md" +
          (focused
            ? " border-indigo-400 ring-2 ring-indigo-100"
            : " border-slate-200")
        }
      >
        <div className="grid gap-2">
          <a
            href={`/tile12-osm?tilekey=${tile.id}`}
            target="_blank"
            className="font-mono text-sm font-semibold text-indigo-600 hover:text-indigo-500 hover:underline"
          >
            {tile.z}/{tile.x}/{tile.y}
          </a>
          <div className="flex flex-wrap gap-1.5">
            <button
              className={
                "cursor-pointer rounded-full border px-2.5 py-1 font-medium transition-colors" +
                (focused
                  ? " border-amber-300 bg-amber-100 text-amber-800"
                  : " border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200")
              }
              itemID={tile.id}
              itemType="tile/where"
            >
              where?
            </button>
            <button
              onClick={() => void handleDownloadOsm()}
              disabled={downloadStatus === "queuing"}
              className="cursor-pointer rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloadStatus === "queuing"
                ? "queuing..."
                : downloadStatus === "queued"
                  ? "queued"
                  : downloadStatus === "error"
                    ? "retry download osm"
                    : "down load osm"}
            </button>
            <button
              onClick={() => void handleDownloadHighwayOsm()}
              disabled={highwayDownloadStatus === "queuing"}
              className="cursor-pointer rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-medium text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {highwayDownloadStatus === "queuing"
                ? "queuing..."
                : highwayDownloadStatus === "queued"
                  ? "queued"
                  : highwayDownloadStatus === "error"
                    ? "retry download highway osm"
                    : "down load highway osm"}
            </button>
            <button
              onClick={() => void handleCheckStatus("buildings")}
              className="cursor-pointer rounded-full border border-slate-200 px-2.5 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              buildings & waters?
            </button>
            <button
              onClick={() => void handleCheckStatus("highways")}
              className="cursor-pointer rounded-full border border-slate-200 px-2.5 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              highways?
            </button>
          </div>
        </div>

        <dialog
          ref={statusDialogRef}
          onClose={() => setStatusDialogInfo(null)}
          className="fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
        >
          {statusDialogInfo && (
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {statusDialogInfo.label}
                  </h2>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">
                    tile {tile.z}/{tile.x}/{tile.y}
                  </p>
                </div>
                <button
                  onClick={() => setStatusDialogInfo(null)}
                  aria-label="Close"
                  className="cursor-pointer rounded-full px-1.5 py-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                {statusDialogInfo.errorText ? (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-600">
                    {statusDialogInfo.errorText}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span className="text-slate-500">Job status</span>
                      <span className="font-medium text-slate-800">
                        {statusDialogInfo.statusText}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span className="text-slate-500">Data loaded</span>
                      <span className="font-medium text-slate-800">
                        {statusDialogInfo.loadedText}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setStatusDialogInfo(null)}
                className="mt-5 w-full cursor-pointer rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                Close
              </button>
            </div>
          )}
        </dialog>
      </li>
    );
  },
);
