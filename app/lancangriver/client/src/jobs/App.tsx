import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../_components";

import {
  defaultCoverageApi,
  highwaysCoverageApi,
  type CoverageJobsPage,
} from "./api";
import { JobsTable } from "./JobsTable";
import { tileZxyToCenterLatlng } from "../experiments/sphere-zoom/tile";

const PAGE_SIZE = 100;

type TabKey = "default" | "highways";
type MapExtentKey = "world" | "china";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "default", label: "Default" },
  { key: "highways", label: "Highways" },
];

const mapExtents: Record<
  MapExtentKey,
  { label: string; extent: readonly number[]; src: string }
> = {
  world: {
    label: "World",
    extent: [90, 180, -90, -180] as const,
    src: "https://www.nationsonline.org/maps/Physical-World-Map-3360.jpg",
  },
  china: {
    label: "China",
    extent: [54.316, 136.412, 17.151, 70.644] as const,
    src: "https://www.freeworldmaps.net/asia/china/china-map-physical.jpg",
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("default");
  const [mapExtentKey, setMapExtentKey] = useState<MapExtentKey>("china");
  const [isMapOpen, setIsMapOpen] = useState(true);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CoverageJobsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const api =
    activeTab === "highways" ? highwaysCoverageApi : defaultCoverageApi;

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    void api
      .fetchCoverageJobs({ limit: PAGE_SIZE, offset })
      .then((nextPage) => {
        if (active) {
          setPage(nextPage);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [api, offset]);

  const total = page?.total ?? 0;
  const canGoBack = offset > 0 && !loading;
  const canGoForward = offset + PAGE_SIZE < total && !loading;

  const switchTab = (tab: TabKey) => {
    if (tab === activeTab) {
      return;
    }

    setActiveTab(tab);
    setOffset(0);
    setPage(null);
    setError(null);
  };

  useEffect(() => {
    const mapExtent = mapExtents[mapExtentKey].extent;
    let lastId: string = null;

    const projectToUV = (
      lat: number,
      lng: number,
      extent: readonly number[],
    ) => {
      const [north, east, south, west] = extent;
      const u = (lng - west) / (east - west);
      const v = (north - lat) / (north - south);
      return { u, v };
    };

    const overout = (event: MouseEvent) => {
      if (event.type === "mouseover") {
        const target = event.target as HTMLTableRowElement;
        const row = target.closest("tr[itemtype=jobrow]");

        if (row) {
          const id = row.getAttribute("itemid");
          if (lastId === id) return;

          lastId = id;
          const [z, x, y] = id.split("/").map(Number);
          const latlng = tileZxyToCenterLatlng(z, x, y);

          const [north, east, south, west] = mapExtent;

          // Check if coordinates are within extent bounds
          const isWithinExtent =
            latlng.lat >= south &&
            latlng.lat <= north &&
            latlng.lng >= west &&
            latlng.lng <= east;

          if (isWithinExtent) {
            const { u, v } = projectToUV(latlng.lat, latlng.lng, mapExtent);
            markerElement.style.display = "block";
            markerElement.style.top = `${v * 100}%`;
            markerElement.style.left = `${u * 100}%`;
          } else {
            markerElement.style.display = "none";
          }
        }
      } else {
        lastId = null;
        console.log("clear");
        markerElement.style.display = "none";
      }
    };

    const tableElement = tableRef.current;
    tableElement.addEventListener("mouseover", overout);
    tableElement.addEventListener("mouseout", overout);

    const mapElement = mapRef.current;
    const markerElement = mapElement.children[1] as HTMLDivElement;

    return () => {
      tableElement.removeEventListener("mouseover", overout);
      tableElement.removeEventListener("mouseout", overout);
    };
  }, [mapExtentKey]);

  return (
    <main className="min-h-screen h-screen overflow-hidden bg-jade-foundation px-4 py-4 text-jade-text sm:px-6 lg:px-8">
      <div
        className={`fixed top-0 z-10 right-0 flex items-center transition-all duration-300 ${isMapOpen ? "w-3xl" : "w-64"}`}
      >
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-2 rounded-xl border border-jade-border-soft bg-jade-panel/95 p-2 shadow-2xl shadow-[#182a36]/20 backdrop-blur-md">
          <button
            onClick={() => setIsMapOpen(!isMapOpen)}
            className="rounded-lg border border-jade-border-soft bg-jade-control px-3 py-1.5 text-xs font-semibold text-jade-text shadow-sm transition-colors hover:bg-jade-control-hover focus:outline-none focus:ring-2 focus:ring-jade-river"
          >
            {isMapOpen ? "Close" : "Open"}
          </button>
          {isMapOpen && (
            <div className="flex gap-1 rounded-lg border border-jade-border-soft bg-jade-control/70 p-1">
              <button
                onClick={() => setMapExtentKey("china")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-jade-river focus:ring-offset-1 ${
                  mapExtentKey === "china"
                    ? "bg-jade-river-soft text-jade-text shadow-sm"
                    : "text-jade-text-muted hover:bg-jade-control hover:text-jade-text"
                }`}
              >
                China
              </button>
              <button
                onClick={() => setMapExtentKey("world")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-jade-river focus:ring-offset-1 ${
                  mapExtentKey === "world"
                    ? "bg-jade-river-soft text-jade-text shadow-sm"
                    : "text-jade-text-muted hover:bg-jade-control hover:text-jade-text"
                }`}
              >
                World
              </button>
            </div>
          )}
        </div>
        <div
          ref={mapRef}
          className="relative overflow-hidden rounded-2xl border border-jade-border-soft bg-jade-panel/80 shadow-2xl shadow-[#182a36]/20"
        >
          <img
            className=" w-full"
            src={mapExtents[mapExtentKey].src}
            alt={mapExtents[mapExtentKey].label}
          />
          <div className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.25)] transition-all duration-100 ease-in" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl h-full flex flex-col">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <a
              href="/portal.html"
              target="_blank"
              className="text-[10px] font-semibold uppercase tracking-[0.2em] text-jade-river hover:text-jade-river/80"
            >
              Lancangriver Portal
            </a>
            <h1 className="mt-1 text-xl font-semibold text-jade-text">
              Vector Ingest Jobs
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-jade-text-muted">
              Zoom-12 OSM coverage status and failed-job controls for default
              and highways targets.
            </p>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-jade-text-muted">
              Jobs total
            </div>
            <div className="text-2xl font-semibold tabular-nums text-jade-text">
              {total.toLocaleString()}
            </div>
          </div>
        </header>

        <nav
          className="mb-3 flex flex-wrap items-center justify-between gap-3"
          aria-label="Controls"
        >
          <div className="flex items-center gap-2" aria-label="Ingest target">
            {tabs.map((tab) => {
              const selected = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchTab(tab.key)}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                    selected
                      ? "border-jade-river bg-jade-river-soft text-jade-text"
                      : "border-jade-border-soft bg-jade-control text-jade-text-muted hover:bg-jade-control-hover"
                  }`}
                  aria-pressed={selected}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2" aria-label="Map extent">
            {(
              Object.entries(mapExtents) as Array<
                [MapExtentKey, (typeof mapExtents)[MapExtentKey]]
              >
            ).map(([key, { label }]) => {
              const selected = key === mapExtentKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMapExtentKey(key)}
                  className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                    selected
                      ? "border-jade-river bg-jade-river-soft text-jade-text"
                      : "border-jade-border-soft bg-jade-control text-jade-text-muted hover:bg-jade-control-hover"
                  }`}
                  aria-pressed={selected}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </nav>

        {error ? (
          <div className="mb-3 rounded-lg border border-jade-error/25 bg-jade-error/10 px-4 py-3 text-sm text-jade-error">
            {error}
          </div>
        ) : null}

        <div ref={tableRef} className="relative flex-1 min-h-0">
          <JobsTable page={page} loading={loading} error={error} api={api} />
        </div>

        <footer className="mt-4 flex items-center justify-between gap-4">
          <div className="text-xs tabular-nums text-jade-text-muted">
            {total === 0
              ? "0 results"
              : `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() =>
                setOffset((current) => Math.max(0, current - PAGE_SIZE))
              }
              className="rounded-lg border border-jade-border-soft bg-jade-control px-4 py-2 text-sm font-medium text-jade-text-muted hover:bg-jade-control-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canGoForward}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              className="rounded-lg border border-jade-river bg-jade-river px-4 py-2 text-sm font-semibold text-white hover:bg-jade-river/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
