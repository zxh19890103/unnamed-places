import { useEffect, useRef, useState } from 'react';

import type { Sphere, SphereStatsPayload } from '../Sphere.class';
import { TilesBytes } from './TilesBytes';
import { Panel, DataList } from '@/_components';
import { useCurrentThreeDTilesViewerState } from '@/_3dtiles';
import { ExploreControls, ExploreControlsLiveState } from '../controls/ExploreControls.class';

type SceneMonitorProps = {
  sphere: Sphere | null;
  controls: ExploreControls;
  threeJsStats: any;
};

const formatters = {
  meters: (distanceMeters: number | null) =>
    distanceMeters === null ? '--' : `${Math.round(distanceMeters).toLocaleString()} m`,
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

export function SceneMonitor({ sphere, threeJsStats, controls }: SceneMonitorProps) {
  const viewrState = useCurrentThreeDTilesViewerState('any');

  const [controlsState, setControlsLiveState] = useState<ExploreControlsLiveState>(
    controls.liveState,
  );

  useEffect(() => {
    const onstate = ({ data }) => {
      setControlsLiveState(data);
    };

    controls.addEventListener('state', onstate);

    return () => {
      controls.removeEventListener('state', onstate);
    };
  }, [controls]);

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
          { label: 'zoom', value: controlsState.zoom },
          { label: 'lat', value: controlsState.latlng.lat.toFixed(6) },
          { label: 'lng', value: controlsState.latlng.lng.toFixed(6) },
          { label: 'alt', value: formatters.meters(controlsState.alt) },
          { label: 'height', value: formatters.meters(controlsState.height) },
          { label: 'distance', value: formatters.meters(controlsState.distance) },
          { label: 'elevation(min)', value: formatters.meters(controlsState.elevationMin) },
          { label: 'elevation(max)', value: formatters.meters(controlsState.elevationMax) },
          { label: 'mode', value: controlsState.mode },
          { label: 'tiles', value: viewrState.tilesCount },
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
