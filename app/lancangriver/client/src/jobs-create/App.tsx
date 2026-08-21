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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100 lg:flex-row">
      <main className="min-h-0 min-w-0 flex-1">
        <LeafletBBoxMap
          focusTile={focusTile}
          bbox={bbox}
          latlng={latlng}
          onBoundsChange={setVisibleBounds}
        />
      </main>

      <aside className="flex h-[43vh] w-full shrink-0 flex-col border-t border-white/10 bg-[rgba(8,10,14,0.94)] shadow-2xl shadow-black/30 backdrop-blur-md lg:h-full lg:w-96 lg:border-l lg:border-t-0">
        <header className="border-b border-white/10 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-400">
                Coverage workspace
              </p>
              <h1 className="mt-1 text-sm font-semibold tracking-wide text-white">
                Zoom {COVERAGE_ZOOM} Coverage
              </h1>
            </div>
            <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] tabular-nums text-slate-400">
              {tiles.length} tiles
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {tiles.length === 0
              ? "Visible map exceeds 30km, zoom in to list tiles"
              : "Tiles covering the current map view"}
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
    const element = elementRef.current;
    if (!element) return;

    const handleClick = (event: MouseEvent) => {
      // if it is the button of itemtype = `where?`, trigger
      const target = event.target as HTMLElement;
      const button = target.closest('button[itemtype="tile/where"]');

      if (button) {
        const id = button.getAttribute("itemid");
        if (id) onTileClick(id);
      }
    };

    element.addEventListener("click", handleClick);
    return () => element.removeEventListener("click", handleClick);
  }, [onTileClick]);

  return (
    <div
      ref={elementRef}
      className="min-h-0 flex-1 overflow-y-auto bg-black/10"
    >
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
          "rounded-xl border bg-white/5 p-3 text-xs shadow-lg shadow-black/10 transition-colors hover:bg-white/10" +
          (focused
            ? " border-sky-400/70 ring-1 ring-sky-400/30"
            : " border-white/10")
        }
      >
        <div className="grid gap-2">
          <a
            href={`/tile12-osm?tilekey=${tile.id}`}
            target="_blank"
            className="font-mono text-sm font-semibold text-slate-200 hover:text-sky-300 hover:underline"
          >
            {tile.z}/{tile.x}/{tile.y}
          </a>
          <div className="flex flex-wrap gap-1.5">
            <button
              className={
                "cursor-pointer rounded-lg border px-2.5 py-1 font-medium transition-colors" +
                (focused
                  ? " border-sky-400/50 bg-sky-400/15 text-sky-200"
                  : " border-white/10 bg-white/5 text-slate-300 hover:bg-white/10")
              }
              itemID={tile.id}
              itemType="tile/where"
            >
              where?
            </button>
            <button
              onClick={() => void handleDownloadOsm()}
              disabled={downloadStatus === "queuing"}
              className="cursor-pointer rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-medium text-emerald-300 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="cursor-pointer rounded-lg border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 font-medium text-sky-300 transition-colors hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
            >
              buildings & waters?
            </button>
            <button
              onClick={() => void handleCheckStatus("highways")}
              className="cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
            >
              highways?
            </button>
          </div>
        </div>

        <dialog
          ref={statusDialogRef}
          onClose={() => setStatusDialogInfo(null)}
          className="fixed top-1/2 left-1/2 m-0 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[rgba(8,10,14,0.96)] p-0 text-slate-200 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
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
                  className="cursor-pointer rounded-lg px-1.5 py-0.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                {statusDialogInfo.errorText ? (
                  <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-rose-300">
                    {statusDialogInfo.errorText}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                      <span className="text-slate-400">Job status</span>
                      <span className="font-medium text-slate-200">
                        {statusDialogInfo.statusText}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                      <span className="text-slate-400">Data loaded</span>
                      <span className="font-medium text-slate-200">
                        {statusDialogInfo.loadedText}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setStatusDialogInfo(null)}
                className="mt-5 w-full cursor-pointer rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400"
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
