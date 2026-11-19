import { useEffect, useRef, useState } from 'react';
import type {
  JourneyBuildResult,
  JourneyDayNode,
  JourneyGeoNode,
  JourneyPhotosCapacities,
  PhotoChipSelection,
  PhotoRecord,
} from '@/photos/types';
import { createGeoNodeFromChip } from '@/photos/chips';
import { JourneyPanel } from '@/photos/JourneyPanel';
import '@/styles.css';

import { PhotoviewViewer } from './_viewer.js';
import { LoadFlatMap, LoadLatlngSyncMap } from './_map.js';
import { OsmJobsCreate } from './_osm.js';
import { AButton } from '@/_components';
import { downloadScenePng } from './print';
import { PhotoModal } from './PhotoModal';
import { sortPhotosByTime } from './_photoTime';
import type { BBox } from './_tile';

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalActivePhoto, setModalActivePhoto] = useState<PhotoRecord | null>(null);
  const [modalPhotos, setModalPhotos] = useState<PhotoRecord[]>([]);
  const [modalOsmBbox, setModalOsmBbox] = useState<BBox | null>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const instance = new PhotoviewViewer(mountEl);
    setViewer(instance);

    const handleArrived = (e: { photo: PhotoRecord }) => {
      setCurrentPhoto(e.photo);
    };

    instance.photosManager.addEventListener('photoArrived', handleArrived);

    return () => {
      instance.photosManager.removeEventListener('photoArrived', handleArrived);
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

  const handlePhotoChipSelect = (selection: PhotoChipSelection) => {
    if (!result?.lodHierarchy) {
      handleGeoOpenByKey(selection.chipId);
      return;
    }

    if (
      result.lodHierarchy.revision &&
      selection.revision &&
      result.lodHierarchy.revision !== selection.revision
    ) {
      console.warn('Ignoring stale photo-chip selection from outdated revision');
      return;
    }

    const { chipId, selectionType, photoIds, representativePhotoId } = selection;
    const photos: PhotoRecord[] = [];
    for (const id of photoIds) {
      const p = result.lodHierarchy.photoMap.get(id);
      if (p) photos.push(p);
    }
    if (photos.length === 0) return;

    const chip = result.lodHierarchy.allChips.get(chipId);
    const fallbackChip = {
      id: chipId,
      level: 0,
      x: 0,
      y: 0,
      parentId: null,
      childIds: [],
      photoCount: photos.length,
      representativePhotoId,
      representativeLat: selection.representativeLat,
      representativeLng: selection.representativeLng,
      bounds: {
        minLat: selection.representativeLat,
        maxLat: selection.representativeLat,
        minLng: selection.representativeLng,
        maxLng: selection.representativeLng,
      },
    };

    const geoNode = createGeoNodeFromChip(chip ?? fallbackChip, photos);
    handleGeoOpen(geoNode);

    if (selectionType === 'single-photo') {
      const targetPhoto = result.lodHierarchy.photoMap.get(representativePhotoId) ?? photos[0];
      if (targetPhoto) {
        handlePhotoSelect(targetPhoto, geoNode);
      }
    }
  };

  const handleGeoClose = () => {
    setIsModalOpen(false);
    setModalActivePhoto(null);
    setModalPhotos([]);
    setModalOsmBbox(null);
    setCurrentGeoNode(null);
    viewer?.closeGeoNode();
  };

  const nodePhotos = currentGeoNode?.photos ?? [];
  const availablePhotos = currentGeoNode ? nodePhotos : (result?.records ?? []);
  const hasAvailablePhotos = availablePhotos.length > 0;

  const handleOpenPhotoModal = () => {
    if (!hasAvailablePhotos) return;
    const photos = [...availablePhotos];
    const initialPhoto = currentGeoNode ? photos[0] : sortPhotosByTime(photos)[0];
    const bbox = currentGeoNode ? viewer?.tileGrid?.bbox : null;
    setModalOsmBbox(bbox ? { ...bbox } : null);
    setModalPhotos(photos);
    setModalActivePhoto(initialPhoto);
    setIsModalOpen(true);
  };

  const [isLocating, setIsLocating] = useState(false);

  const handleCurrentGeo = () => {
    if (!viewer) return;

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        handleGeoClose();
        viewer.renderAtLatLng({ lat: latitude, lng: longitude });
      },
      (error) => {
        setIsLocating(false);
        console.warn('Geolocation error:', error);
        alert(`Failed to get current location: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
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
    onLoaded: (journey) => {
      printAbortRef.current?.abort();
      handleGeoClose();
      setCurrentPhoto(null);
      setResult(journey);
    },
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-jade-foundation">
      <div className="contents" inert={printProgress !== null}>
        <div ref={mountRef} className="h-full w-full" aria-label="Photo view in 3D scene" />

        <div className="pointer-events-auto fixed right-4 top-4 z-20">
          <JourneyPanel motions={false} byDay={false} capacities={capacities} />
        </div>

        <div
          role="group"
          aria-label="3D map controls"
          className="fixed bottom-36 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/20 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-md sm:bottom-20 xl:bottom-4"
        >
          <button
            type="button"
            onClick={switchToOrbitCtrls}
            aria-pressed={controlsMode === 'orbit'}
            className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${controlsMode === 'orbit' ? 'bg-emerald-300 text-slate-950' : 'text-white hover:bg-white/15'}`}
          >
            Orbit
          </button>
          <button
            type="button"
            onClick={switchToMapCtrls}
            aria-pressed={controlsMode === 'map'}
            className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${controlsMode === 'map' ? 'bg-emerald-300 text-slate-950' : 'text-white hover:bg-white/15'}`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={toggleClouds}
            aria-pressed={cloudsVisible}
            className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${cloudsVisible ? 'bg-emerald-300 text-slate-950' : 'text-white hover:bg-white/15'}`}
          >
            Clouds {cloudsVisible ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="fixed bottom-20 left-4 flex items-center gap-2 sm:bottom-4">
          {result && (
            <LoadFlatMap
              data={result}
              onChipKeySelect={handleGeoOpenByKey}
              onPhotoChipSelect={handlePhotoChipSelect}
            />
          )}
          <AButton disabled={!viewer || isLocating} onClick={handleCurrentGeo}>
            {isLocating ? 'Locating...' : 'Current location'}
          </AButton>
        </div>

        <div className="fixed left-4 top-4">
          {viewer && (
            <LoadLatlngSyncMap latlngReader={viewer.readLatLng} controls={viewer.currentControls} />
          )}
        </div>

        <div className="fixed left-1/2 -translate-x-1/2 top-4">
          {viewer && <OsmJobsCreate viewer={viewer} />}
        </div>

        <div className="fixed bottom-4 right-4 z-20 max-w-sm">
          <div className="flex items-center justify-end gap-2">
            <AButton
              disabled={!hasAvailablePhotos}
              onClick={handleOpenPhotoModal}
              title={
                hasAvailablePhotos
                  ? `${currentGeoNode ? 'Selected chip' : 'All loaded photos'}: view original photos (${availablePhotos.length})`
                  : currentGeoNode
                    ? 'Selected chip has no photos'
                    : 'No photo records loaded yet'
              }
            >
              View Original Photo{hasAvailablePhotos && ` (${availablePhotos.length})`}
            </AButton>
            <AButton disabled={!viewer || printProgress !== null} onClick={handlePrint}>
              Export A2 PNG
            </AButton>
          </div>
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

      {isModalOpen && modalActivePhoto && (
        <PhotoModal
          photo={modalActivePhoto}
          photos={modalPhotos}
          osmBbox={modalOsmBbox}
          onClose={() => {
            setIsModalOpen(false);
            setModalActivePhoto(null);
            setModalPhotos([]);
            setModalOsmBbox(null);
          }}
        />
      )}
    </div>
  );
}
