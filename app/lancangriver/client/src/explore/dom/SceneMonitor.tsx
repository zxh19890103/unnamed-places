import { useEffect, useRef, useState } from "react";

import type { Sphere, SphereStatsPayload } from "../Sphere.class";
import { TilesBytes } from "./TilesBytes";

type SceneMonitorProps = {
  sphere: Sphere | null;
  threeJsStats: any;
};

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) {
    return "--";
  }

  return `${Math.round(distanceMeters).toLocaleString()} m`;
}

function formatZoom(zoomLevel: number | null) {
  if (zoomLevel === null) {
    return "--";
  }

  return `${zoomLevel}`;
}

function formatTileCount(visibleTilesCount: number | null) {
  if (visibleTilesCount === null) {
    return "--";
  }

  return `${visibleTilesCount}`;
}

function formatControlMode(
  controlMode: SphereStatsPayload["controlMode"] | null,
) {
  if (!controlMode) {
    return "--";
  }

  return controlMode;
}

function formatLoadingProgress(stats: SphereStatsPayload | null) {
  if (!stats) {
    return "--";
  }

  const pending = stats.loadingTotal - stats.loadingLoaded;
  const errSuffix =
    stats.loadingErrors > 0
      ? `, ${stats.loadingErrors} error${stats.loadingErrors === 1 ? "" : "s"}`
      : "";

  if (pending <= 0) {
    return `idle${errSuffix}`;
  }

  return `${pending}${errSuffix}`;
}

function formatFrameP95(stats: SphereStatsPayload | null) {
  if (!stats || stats.frameTimeP95Ms <= 0) {
    return "--";
  }

  return `${stats.frameTimeP95Ms.toFixed(1)} ms`;
}

export function SceneMonitor({ sphere, threeJsStats }: SceneMonitorProps) {
  const [stats, setStats] = useState<SphereStatsPayload | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const threejsStatsDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sphere) {
      setStats(null);
      return;
    }

    const threejsStatsDiv = threejsStatsDivRef.current;
    threejsStatsDiv.appendChild(threeJsStats.dom);

    setStats(sphere.getStatsSnapshot());

    const handleStats = (event: Event) => {
      const payload = (event as Event & { payload?: SphereStatsPayload })
        .payload;
      if (payload) {
        setStats(payload);
      }
    };

    sphere.addStatsListener(handleStats as (event: Event) => void);
    return () => {
      sphere.removeStatsListener(handleStats as (event: Event) => void);
      threejsStatsDiv.removeChild(threeJsStats.dom);
    };
  }, [sphere]);

  const distanceMeters = stats?.cameraDistanceMeters ?? null;
  const zoomLevel = stats?.zoomLevel ?? null;
  const visibleTilesCount = stats?.visibleTilesCount ?? null;
  const controlMode = stats?.controlMode ?? null;

  return (
    <aside
      className={`pointer-events-auto max-w-[calc(100vw-1.5rem)] rounded-xl bg-(--jade-panel)/95 px-3.5 py-3 text-(--jade-text) shadow-xl shadow-[#182a36]/20 backdrop-blur-md ${
        isCollapsed ? "min-w-0" : "min-w-56"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.16em] text-(--jade-river) uppercase">
            Live diagnostics
          </div>
          <div className="mt-0.5 text-sm font-semibold tracking-wide text-(--jade-text)">
            Scene monitor
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="min-h-9 cursor-pointer rounded-lg border border-(--jade-border-soft) bg-(--jade-control) px-2.5 py-1.5 text-[11px] font-medium text-(--jade-text-muted) transition-colors hover:border-(--jade-border) hover:bg-jade-control-hover hover:text-(--jade-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--jade-river)"
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed ? "Expand scene monitor" : "Collapse scene monitor"
          }
        >
          {isCollapsed ? "Expand" : "Hide"}
        </button>
      </div>
      <div className=" mt-3" ref={threejsStatsDivRef} />
      {!isCollapsed && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
          <div className="rounded-lg border border-(--jade-border-soft) bg-(--jade-depth)/45 p-2.5">
            <div className="text-[10px] tracking-wide text-(--jade-text-muted) uppercase">
              Camera distance
            </div>
            <div className="mt-1 font-medium tabular-nums text-(--jade-text)">
              {formatDistance(distanceMeters)}
            </div>
          </div>
          <div className="rounded-lg border border-(--jade-border-soft) bg-(--jade-depth)/45 p-2.5">
            <div className="text-[10px] tracking-wide text-(--jade-text-muted) uppercase">
              Zoom level
            </div>
            <div className="mt-1 font-medium tabular-nums text-(--jade-text)">
              {formatZoom(zoomLevel)}
            </div>
          </div>
          <div className="rounded-lg border border-(--jade-border-soft) bg-(--jade-depth)/45 p-2.5">
            <div className="text-[10px] tracking-wide text-(--jade-text-muted) uppercase">
              Visible tiles
            </div>
            <div className="mt-1 font-medium tabular-nums text-(--jade-text)">
              {formatTileCount(visibleTilesCount)}
            </div>
          </div>
          <div className="rounded-lg border border-(--jade-border-soft) bg-(--jade-depth)/45 p-2.5">
            <div className="text-[10px] tracking-wide text-(--jade-text-muted) uppercase">
              Control mode
            </div>
            <div className="mt-1 truncate font-medium text-(--jade-text)">
              {formatControlMode(controlMode)}
            </div>
          </div>
          <div className="rounded-lg border border-(--jade-border-soft) bg-(--jade-depth)/45 p-2.5">
            <div className="text-[10px] tracking-wide text-(--jade-text-muted) uppercase">
              Asset loading
            </div>
            <div className="mt-1 font-medium tabular-nums text-(--jade-text)">
              {formatLoadingProgress(stats)}
            </div>
          </div>
          <div className="rounded-lg border border-(--jade-border-soft) bg-(--jade-depth)/45 p-2.5">
            <div className="text-[10px] tracking-wide text-(--jade-text-muted) uppercase">
              Frame p95
            </div>
            <div className="mt-1 font-medium tabular-nums text-(--jade-text)">
              {formatFrameP95(stats)}
            </div>
          </div>
          <div className="col-span-2 rounded-lg border border-(--jade-border-soft) bg-(--jade-depth)/45 p-2.5">
            <TilesBytes />
          </div>
        </div>
      )}
    </aside>
  );
}
