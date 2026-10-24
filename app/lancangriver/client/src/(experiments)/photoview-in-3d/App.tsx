import { useEffect, useRef, useState } from 'react';
import type {
  JourneyBuildResult,
  JourneyDayNode,
  JourneyGeoNode,
  JourneyPhotosCapacities,
  PhotoRecord,
} from '@/photos/types';
import { JourneyPanel } from '@/photos/JourneyPanel';
import '@/styles.css';

import { PhotoviewViewer } from './_viewer.js';
import { LoadFlatMap, LoadLatlngSyncMap } from './_map.js';
import { OsmJobsCreate } from './_osm.js';
import { AButton } from '@/_components';
import { downloadScenePng } from './print';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [viewer, setViewer] = useState<PhotoviewViewer | null>(null);
  const [controlsMode, setControlsMode] = useState<'orbit' | 'map'>('orbit');
  const printAbortRef = useRef<AbortController | null>(null);
  const [printProgress, setPrintProgress] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const [currentGeoNode, setCurrentGeoNode] = useState<JourneyGeoNode>(null);
  const [currentPhoto, setCurrentPhoto] = useState<PhotoRecord>(null);
  const [result, setResult] = useState<JourneyBuildResult>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const instance = new PhotoviewViewer(mountEl);
    setViewer(instance);

    return () => {
      printAbortRef.current?.abort();
      instance.dispose();
      setViewer(null);
    };
  }, []);

  const handlePrint = async () => {
    if (!viewer || printAbortRef.current) return;
    const controller = new AbortController();
    printAbortRef.current = controller;
    setPrintError(null);
    setPrintProgress('Preparing A2 PNG...');
    try {
      await downloadScenePng(viewer, controller.signal, setPrintProgress);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Failed to export scene PNG:', error);
        setPrintError(error instanceof Error ? error.message : 'Image export failed.');
      }
    } finally {
      printAbortRef.current = null;
      setPrintProgress(null);
    }
  };

  const handlePhotoSelect = (photo: PhotoRecord, _geoNode: JourneyGeoNode) => {
    setCurrentPhoto(photo);
    viewer?.selectPhoto(photo);
  };

  const handleGeoOpen = async (geoNode: JourneyGeoNode) => {
    setCurrentGeoNode(geoNode);
    await viewer?.openGeoNode(geoNode);
  };

  const handleGeoOpenByKey = (key: string) => {
    const node = result?.geoNodes.find((n) => n.chipKey === key);
    if (node) {
      handleGeoOpen(node);
    }
  };

  const handleGeoClose = () => {
    setCurrentGeoNode(null);
    viewer?.closeGeoNode();
  };

  const [cloudsVisible, setCloudsVisible] = useState(true);

  const toggleClouds = () => {
    if (!viewer) return;
    if (viewer.clouds) {
      viewer.removeClouds();
      setCloudsVisible(false);
    } else {
      viewer.addClouds();
      setCloudsVisible(true);
    }
  };

  const switchToOrbitCtrls = () => {
    viewer?.switchControls('orbit');
    setControlsMode('orbit');
  };

  const switchToMapCtrls = () => {
    viewer?.switchControls('map');
    setControlsMode('map');
  };

  const capacities: JourneyPhotosCapacities = {
    scene: (viewer?.scene ?? null) as any,
    photo: currentPhoto,
    geoNode: currentGeoNode,
    onDaySelect: (_day: JourneyDayNode) => {},
    onGeoOpen: handleGeoOpen,
    onGeoClose: handleGeoClose,
    onPhotoSelect: handlePhotoSelect,
    onLoaded: setResult,
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-jade-foundation font-suse-mono">
      <div className="contents" inert={printProgress !== null}>
        <div ref={mountRef} className="h-full w-full" aria-label="Photo view in 3D scene" />

        <div className="pointer-events-auto fixed right-4 top-4 z-20">
          <JourneyPanel motions={false} byDay={false} capacities={capacities} />
        </div>

        <div className="pointer-events-none fixed bottom-4 left-0 flex w-full h-auto justify-center gap-4">
          <button
            type="button"
            onClick={switchToOrbitCtrls}
            className={`cursor-pointer pointer-events-auto ${controlsMode === 'orbit' ? 'text-amber-300 font-semibold underline' : 'text-amber-50'}`}
          >
            Orbit
          </button>
          <button
            type="button"
            onClick={switchToMapCtrls}
            className={`cursor-pointer pointer-events-auto ${controlsMode === 'map' ? 'text-amber-300 font-semibold underline' : 'text-amber-50'}`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={toggleClouds}
            className={`cursor-pointer pointer-events-auto ${cloudsVisible ? 'text-amber-300 font-semibold underline' : 'text-amber-50'}`}
          >
            Clouds {cloudsVisible ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="fixed bottom-4 left-4">
          {result && <LoadFlatMap data={result} onChipKeySelect={handleGeoOpenByKey} />}
        </div>

        <div className="fixed left-4 top-4">
          {viewer && (
            <LoadLatlngSyncMap latlngReader={viewer.readLatLng} controls={viewer.currentControls} />
          )}
        </div>

        <div className="fixed left-1/2 -translate-x-1/2 top-4">
          {viewer && <OsmJobsCreate viewer={viewer} />}
        </div>

        <div className="fixed bottom-16 right-4 z-20 max-w-sm">
          <AButton disabled={!viewer || printProgress !== null} onClick={handlePrint}>
            Export A2 PNG
          </AButton>
          {printError && (
            <p role="alert" className="mt-3 rounded-lg bg-jade-panel p-3 text-sm text-jade-error">
              {printError}
            </p>
          )}
        </div>
      </div>

      {printProgress !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-jade-foundation/95"
          role="dialog"
          aria-modal="true"
          aria-label="Exporting scene"
          onKeyDown={(event) => {
            if (event.key === 'Escape') printAbortRef.current?.abort();
          }}
        >
          <div className="space-y-4 rounded-2xl border border-slate-700 bg-jade-panel p-6 text-center">
            <h2 className="font-share-tech-mono text-lg">A2 landscape PNG</h2>
            <p role="status" className="text-sm">
              {printProgress}
            </p>
            <AButton autoFocus onClick={() => printAbortRef.current?.abort()}>
              Cancel
            </AButton>
          </div>
        </div>
      )}
    </div>
  );
}
