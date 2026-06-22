import { useEffect, useState } from "react";

import type { Sphere, SphereStatsPayload } from "./Sphere.class";

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

export function SceneMonitor({ sphere }: SceneMonitorProps) {
  const [stats, setStats] = useState<SphereStatsPayload | null>(null);

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
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 30,
        minWidth: 220,
        padding: "12px 14px",
        borderRadius: 12,
        background: "rgba(8, 10, 14, 0.88)",
        color: "#ffffff",
        boxShadow: "0 12px 30px rgba(0, 0, 0, 0.28)",
        pointerEvents: "none",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 0.08, opacity: 0.72 }}>
        Runtime Monitor
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 13 }}>
        <div>
          <div style={{ opacity: 0.68 }}>Camera distance</div>
          <div>{formatDistance(distanceMeters)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.68 }}>Zoom level</div>
          <div>{formatZoom(zoomLevel)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.68 }}>Visible tiles</div>
          <div>{formatTileCount(visibleTilesCount)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.68 }}>Controls mode</div>
          <div>{formatControlMode(controlMode)}</div>
        </div>
      </div>
    </aside>
  );
}
