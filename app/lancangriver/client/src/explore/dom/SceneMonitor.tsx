import { useEffect, useState } from "react";

import type { Sphere, SphereStatsPayload } from "../Sphere.class";
import { TilesBytes } from "./TilesBytes";

type SceneMonitorProps = {
  sphere: Sphere | null;
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

function formatWashPreset(stats: SphereStatsPayload | null) {
  if (!stats?.washPreset) {
    return "--";
  }

  return stats.washPreset;
}

export function SceneMonitor({ sphere }: SceneMonitorProps) {
  const [stats, setStats] = useState<SphereStatsPayload | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!sphere) {
      setStats(null);
      return;
    }

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
    };
  }, [sphere]);

  const distanceMeters = stats?.cameraDistanceMeters ?? null;
  const zoomLevel = stats?.zoomLevel ?? null;
  const visibleTilesCount = stats?.visibleTilesCount ?? null;
  const controlMode = stats?.controlMode ?? null;

  return (
    <aside
      className={`rounded-xl bg-[rgba(8,10,14,0.88)] px-3.5 py-3 text-white shadow-[0_12px_30px_rgba(0,0,0,0.28)] pointer-events-auto ${
        isCollapsed ? "min-w-0" : "min-w-56"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-base tracking-[0.08em] opacity-70">
          Runtime Monitor
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="cursor-pointer rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-xs leading-[1.2] text-white transition-colors hover:bg-white/15"
          aria-label={
            isCollapsed ? "Open runtime monitor" : "Collapse runtime monitor"
          }
        >
          {isCollapsed ? "Open" : "Collapse"}
        </button>
      </div>
      {!isCollapsed && (
        <div className="mt-2.5 grid gap-2 text-[13px]">
          <div>
            <div className="opacity-[0.68]">Camera distance</div>
            <div>{formatDistance(distanceMeters)}</div>
          </div>
          <div>
            <div className="opacity-[0.68]">Zoom level</div>
            <div>{formatZoom(zoomLevel)}</div>
          </div>
          <div>
            <div className="opacity-[0.68]">Visible tiles</div>
            <div>{formatTileCount(visibleTilesCount)}</div>
          </div>
          <div>
            <div className="opacity-[0.68]">Controls mode</div>
            <div>{formatControlMode(controlMode)}</div>
          </div>
          <div>
            <div className="opacity-[0.68]">Asset loading</div>
            <div>{formatLoadingProgress(stats)}</div>
          </div>
          <div>
            <div className="opacity-[0.68]">Frame p95</div>
            <div>{formatFrameP95(stats)}</div>
          </div>
          <div>
            <div className="opacity-[0.68]">Wash preset</div>
            <div>{formatWashPreset(stats)}</div>
          </div>
          <TilesBytes />
        </div>
      )}
    </aside>
  );
}
