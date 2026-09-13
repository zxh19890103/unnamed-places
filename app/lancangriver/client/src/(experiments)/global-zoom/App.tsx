import React, { useEffect, useRef, useState } from 'react';
import { createGlobalZoomView } from './viewer.js';
import { Button } from '@/_components';
import '@/styles.css';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [cameraDistance, setCameraDistance] = useState('0.00');
  const [planeSizePixels, setPlaneSizePixels] = useState('0.00');
  const [viewport, setViewport] = useState('0 x 0');
  const [zoomScale, setZoomScale] = useState('0.00');
  const [zoomLevel, setZoomLevel] = useState('0');
  const [layerSize, setLayerSize] = useState('0');

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
        setViewport((prev) => (prev === metrics.viewport ? prev : metrics.viewport));
        setZoomScale((prev) => (prev === metrics.zoomScale ? prev : metrics.zoomScale));
        setZoomLevel((prev) => (prev === metrics.zoomLevel ? prev : metrics.zoomLevel));
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
    <main className="relative h-screen w-screen overflow-hidden bg-jade-foundation text-jade-text">
      <div ref={mountRef} className="h-full w-full" />
      <section className="absolute top-3 left-3 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-jade-border bg-jade-panel/95 p-3 text-xs leading-5 shadow-[0_8px_24px_rgba(24,42,54,0.12)] backdrop-blur-md">
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 tabular-nums">
          <dt className="text-jade-text-muted">Camera origin</dt>
          <dd>{cameraDistance}</dd>
          <dt className="text-jade-text-muted">Pixels per unit</dt>
          <dd>{planeSizePixels}</dd>
          <dt className="text-jade-text-muted">Viewport</dt>
          <dd>{viewport}</dd>
          <dt className="text-jade-text-muted">Zoom scale</dt>
          <dd>{zoomScale}</dd>
          <dt className="text-jade-text-muted">Zoom level</dt>
          <dd>{zoomLevel}</dd>
          <dt className="text-jade-text-muted">Tiles</dt>
          <dd>{layerSize}</dd>
        </dl>
        <Button type="button" size="xs" className="mt-3" onClick={handleLogMetrics}>
          Log metrics
        </Button>
      </section>
    </main>
  );
}
