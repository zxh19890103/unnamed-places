import { useEffect, useRef, useState } from 'react';

import type { Sphere, SphereStatsPayload } from '../Sphere.class';
import { TilesBytes } from './TilesBytes';
import { Panel } from '@/_components';

type SceneMonitorProps = {
  sphere: Sphere | null;
  threeJsStats: any;
};

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) {
    return '--';
  }

  return `${Math.round(distanceMeters).toLocaleString()} m`;
}

function formatZoom(zoomLevel: number | null) {
  if (zoomLevel === null) {
    return '--';
  }

  return `${zoomLevel}`;
}

function formatTileCount(visibleTilesCount: number | null) {
  if (visibleTilesCount === null) {
    return '--';
  }

  return `${visibleTilesCount}`;
}

function formatControlMode(controlMode: SphereStatsPayload['controlMode'] | null) {
  if (!controlMode) {
    return '--';
  }

  return controlMode;
}

function formatLoadingProgress(stats: SphereStatsPayload | null) {
  if (!stats) {
    return '--';
  }

  const pending = stats.loadingTotal - stats.loadingLoaded;
  const errSuffix =
    stats.loadingErrors > 0
      ? `, ${stats.loadingErrors} error${stats.loadingErrors === 1 ? '' : 's'}`
      : '';

  if (pending <= 0) {
    return `idle${errSuffix}`;
  }

  return `${pending}${errSuffix}`;
}

function formatFrameP95(stats: SphereStatsPayload | null) {
  if (!stats || stats.frameTimeP95Ms <= 0) {
    return '--';
  }

  return `${stats.frameTimeP95Ms.toFixed(1)} ms`;
}

function ThreejsStats({ threeJsStats }) {
  const threejsStatsDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const threejsStatsDiv = threejsStatsDivRef.current;
    threejsStatsDiv.appendChild(threeJsStats.dom);

    return () => {
      threejsStatsDiv.removeChild(threeJsStats.dom);
    };
  }, []);

  return (
    <div
      className=" size-fit rounded-lg overflow-hidden border border-jade-silt-200  z-99 absolute left-0 -top-2 -translate-y-full"
      ref={threejsStatsDivRef}
    />
  );
}

export function SceneMonitor({ sphere, threeJsStats }: SceneMonitorProps) {
  const [stats, setStats] = useState<SphereStatsPayload | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!sphere) {
      setStats(null);
      return;
    }

    setStats(sphere.getStatsSnapshot());

    const handleStats = (event: Event) => {
      const payload = (event as Event & { payload?: SphereStatsPayload }).payload;
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
    <Panel defaultMinimized title="Live diagnostics" description="Scene monitor">
      <ThreejsStats threeJsStats={threeJsStats} />
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
        <div className="rounded-lg border border-jade-border-soft bg-jade-depth/45 p-2.5">
          <div className="text-[10px] tracking-wide text-jade-text-muted uppercase">
            Camera distance
          </div>
          <div className="mt-1 font-medium tabular-nums text-jade-text">
            {formatDistance(distanceMeters)}
          </div>
        </div>
        <div className="rounded-lg border border-jade-border-soft bg-jade-depth/45 p-2.5">
          <div className="text-[10px] tracking-wide text-jade-text-muted uppercase">Zoom level</div>
          <div className="mt-1 font-medium tabular-nums text-jade-text">
            {formatZoom(zoomLevel)}
          </div>
        </div>
        <div className="rounded-lg border border-jade-border-soft bg-jade-depth/45 p-2.5">
          <div className="text-[10px] tracking-wide text-jade-text-muted uppercase">
            Visible tiles
          </div>
          <div className="mt-1 font-medium tabular-nums text-jade-text)">
            {formatTileCount(visibleTilesCount)}
          </div>
        </div>
        <div className="rounded-lg border border-jade-border-soft bg-jade-depth/45 p-2.5">
          <div className="text-[10px] tracking-wide text-jade-text-muted uppercase">
            Control mode
          </div>
          <div className="mt-1 truncate font-medium text-jade-text">
            {formatControlMode(controlMode)}
          </div>
        </div>
        <div className="rounded-lg border border-jade-border-soft bg-jade-depth/45 p-2.5">
          <div className="text-[10px] tracking-wide text-jade-text-muted uppercase">
            Asset loading
          </div>
          <div className="mt-1 font-medium tabular-nums text-jade-text">
            {formatLoadingProgress(stats)}
          </div>
        </div>
        <div className="rounded-lg border border-jade-border-soft bg-jade-depth/45 p-2.5">
          <div className="text-[10px] tracking-wide text-jade-text-muted uppercase">Frame p95</div>
          <div className="mt-1 font-medium tabular-nums text-jade-text">
            {formatFrameP95(stats)}
          </div>
        </div>
        <div className="col-span-2">
          <TilesBytes />
        </div>
      </div>
    </Panel>
  );
}
