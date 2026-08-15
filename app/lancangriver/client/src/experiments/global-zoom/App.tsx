import React, { useEffect, useRef, useState } from "react";
import { createGlobalZoomView } from "./viewer.js";

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [cameraDistance, setCameraDistance] = useState("0.00");
  const [planeSizePixels, setPlaneSizePixels] = useState("0.00");
  const [viewport, setViewport] = useState("0 x 0");
  const [zoomScale, setZoomScale] = useState("0.00");
  const [zoomLevel, setZoomLevel] = useState("0");
  const [layerSize, setLayerSize] = useState("0");

  const handleLogMetrics = (): void => {
    console.log(`${cameraDistance}, ${planeSizePixels}`);
  };

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) {
      return;
    }

    const view = createGlobalZoomView({
      mountEl,
      onMetrics: (metrics) => {
        setCameraDistance((prev) =>
          prev === metrics.cameraDistance ? prev : metrics.cameraDistance,
        );
        setPlaneSizePixels((prev) =>
          prev === metrics.sizePixelsPerUnit ? prev : metrics.sizePixelsPerUnit,
        );
        setViewport((prev) =>
          prev === metrics.viewport ? prev : metrics.viewport,
        );
        setZoomScale((prev) =>
          prev === metrics.zoomScale ? prev : metrics.zoomScale,
        );
        setZoomLevel((prev) =>
          prev === metrics.zoomLevel ? prev : metrics.zoomLevel,
        );
        setLayerSize((prev) => {
          return prev === metrics.layerSize ? prev : metrics.layerSize;
        });
      },
    });

    return () => {
      view.dispose();
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(15, 23, 42, 0.75)",
          color: "#e2e8f0",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          lineHeight: 1.35,
        }}
      >
        <div>camera-origin: {cameraDistance}</div>
        <div>size pixels per unit: {planeSizePixels}</div>
        <div>viewport: {viewport}</div>
        <div>zoom-scale: {zoomScale}</div>
        <div>zoom-level: {zoomLevel}</div>
        <div>tiles: {layerSize}</div>
        <button
          type="button"
          onClick={handleLogMetrics}
          style={{
            marginTop: 8,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid rgba(148, 163, 184, 0.7)",
            background: "rgba(30, 41, 59, 0.85)",
            color: "#e2e8f0",
            fontFamily: "inherit",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          log metrics
        </button>
      </div>
    </div>
  );
}
