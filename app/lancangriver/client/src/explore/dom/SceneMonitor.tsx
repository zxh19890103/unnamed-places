import { useEffect, useRef, useState } from 'react';

import type { Sphere, SphereStatsPayload } from '../Sphere.class';
import { TilesBytes } from './TilesBytes';
import { Panel, DataList } from '@/_components';
import { useCurrentThreeDTilesViewerState } from '@/_3dtiles';

type SceneMonitorProps = {
  sphere: Sphere | null;
  threeJsStats: any;
};

const formatters = {
  dist: (distanceMeters: number | null) =>
    distanceMeters === null ? '--' : `${Math.round(distanceMeters).toLocaleString()} m`,
  zoom: (zoomLevel: number | null) => (zoomLevel === null ? '--' : `${zoomLevel}`),
  tiles: (visibleTilesCount: number | null) =>
    visibleTilesCount === null ? '--' : `${visibleTilesCount}`,
  loading: (stats: SphereStatsPayload | null) => {
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
  },
  frame: (stats: SphereStatsPayload | null) => {
    if (!stats || stats.frameTimeP95Ms <= 0) {
      return '--';
    }

    return `${stats.frameTimeP95Ms.toFixed(1)} ms`;
  },
};

function ThreejsStats({ threeJsStats }) {
  const threejsStatsDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const threejsStatsDiv = threejsStatsDivRef.current;
    threejsStatsDiv.appendChild(threeJsStats.dom);

    return () => {
      threejsStatsDiv.removeChild(threeJsStats.dom);
    };
  }, [threeJsStats.dom]);

  return (
    <div
      className=" size-fit rounded-lg overflow-hidden border border-jade-silt-200  z-99 absolute left-0 -top-2 -translate-y-full"
      ref={threejsStatsDivRef}
    />
  );
}

export function SceneMonitor({ sphere, threeJsStats }: SceneMonitorProps) {
  const viewrState = useCurrentThreeDTilesViewerState('any');

  const [stats, setStats] = useState<SphereStatsPayload | null>(null);

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

  return (
    <Panel defaultMinimized title="Live diagnostics" description="Scene monitor">
      <ThreejsStats threeJsStats={threeJsStats} />
      <DataList
        size="sm"
        bordered
        valueClassName="tabular-nums"
        items={[
          { label: 'Alt', value: formatters.dist(viewrState.alt) },
          { label: 'distance', value: formatters.dist(viewrState.distance) },
          { label: 'Zoom level', value: formatters.zoom(viewrState.zoom) },
          { label: 'Visible tiles', value: formatters.tiles(viewrState.tilesCount) },
          { label: 'Asset loading', value: formatters.loading(stats) },
          { label: 'Frame p95', value: formatters.frame(stats) },
        ]}
      />
      <div className=" mt-1">
        <TilesBytes />
      </div>
    </Panel>
  );
}
