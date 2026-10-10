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

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [viewer, setViewer] = useState<PhotoviewViewer | null>(null);
  const [controlsMode, setControlsMode] = useState<'orbit' | 'map'>('orbit');

  const [currentGeoNode, setCurrentGeoNode] = useState<JourneyGeoNode>(null);
  const [currentPhoto, setCurrentPhoto] = useState<PhotoRecord>(null);
  const [result, setResult] = useState<JourneyBuildResult>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const instance = new PhotoviewViewer(mountEl);
    setViewer(instance);

    return () => {
      instance.dispose();
      setViewer(null);
    };
  }, []);

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
      viewer.addClouds({ altitudeMeters: 1000, coverage: 0.55 });
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
          <LoadLatlngSyncMap
            latlngReader={viewer.readLatLng}
            controls={viewer.currentControls}
          />
        )}
      </div>

      <div className="fixed left-1/2 -translate-x-1/2 top-4">
        {viewer && <OsmJobsCreate viewer={viewer} />}
      </div>
    </div>
  );
}
