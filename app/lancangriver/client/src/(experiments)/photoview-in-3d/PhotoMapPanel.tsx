import { useEffect, useMemo, useRef, useState } from 'react';
import { Cross1Icon } from '@radix-ui/react-icons';
import * as L from 'leaflet';
import type { PhotoRecord } from '@/photos/types';
import type { BBox } from './_tile';
import {
  MAP_CATEGORIES,
  MAP_CATEGORY_LABELS,
  hasPhotoLocation,
} from './_photoMap';
import { createPhotoMapMarkers } from './_photoMapMarkers';
import { usePhotoMapLayers } from './photo-map/usePhotoMapLayers';
import { usePhotoMapTiles } from './photo-map/usePhotoMapTiles';
import { Tooltip } from '@/_components/Tooltip';
import 'leaflet/dist/leaflet.css';

interface PhotoMapPanelProps {
  photos: PhotoRecord[];
  activePhotoId: string;
  osmBbox: BBox | null;
  onSelect: (photo: PhotoRecord) => void;
  onClose: () => void;
}

export function PhotoMapPanel({
  photos,
  activePhotoId,
  osmBbox,
  onSelect,
  onClose,
}: PhotoMapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<ReturnType<typeof createPhotoMapMarkers> | null>(null);
  const [showTiles, setShowTiles] = useState(false);
  const [showVectors, setShowVectors] = useState(true);
  const locatedPhotos = useMemo(() => photos.filter(hasPhotoLocation), [photos]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, {
      center: [0, 0],
      zoom: 2,
      minZoom: 1,
      maxZoom: 20,
      preferCanvas: true,
      zoomControl: false,
      attributionControl: true,
    });
    map.attributionControl.addAttribution(
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    );
    for (const [pane, zIndex] of [
      ['natural_water', 210],
      ['waters', 220],
      ['highways', 230],
      ['labels', 350],
      ['places', 400],
      ['legs', 450],
      ['photos', 500],
    ] as const) {
      map.createPane(`photo-map-${pane}`).style.zIndex = String(zIndex);
    }
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(container);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const { loading: tilesLoading, error: tilesError } = usePhotoMapTiles(mapRef, showTiles);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = createPhotoMapMarkers(map, locatedPhotos, onSelect);
    markersRef.current = markers;
    return () => {
      markers.dispose();
      markersRef.current = null;
    };
  }, [locatedPhotos, onSelect]);

  useEffect(() => {
    markersRef.current?.setActive(activePhotoId);
  }, [activePhotoId, locatedPhotos, onSelect]);

  const { results, bboxKey, pending, failures, featureCount, retry } =
    usePhotoMapLayers(mapRef, osmBbox, showVectors);
  const invalidCount = photos.length - locatedPhotos.length;
  const activeHasLocation = locatedPhotos.some((photo) => photo.id === activePhotoId);

  return (
    <aside
      id="photo-map-panel"
      data-photo-map
      aria-label="Chip photo map"
      className="flex w-96 shrink-0 flex-col border-r border-white/10 bg-stone-800/80 text-xs text-jade-text"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 p-3">
        <h3 className="font-semibold text-white">Photo map</h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => markersRef.current?.fitAll()}
            disabled={!locatedPhotos.length}
            className="cursor-pointer rounded border border-white/20 px-2 py-1 text-white hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
          >
            Fit all
          </button>
          <button
            type="button"
            onClick={() => setShowTiles((previous) => !previous)}
            aria-pressed={showTiles}
            title="Toggle OpenStreetMap tiles"
            className={`cursor-pointer rounded border px-2 py-1 text-white transition-colors ${
              showTiles ? 'border-jade-river bg-jade-river/20' : 'border-white/20 hover:bg-white/10'
            }`}
          >
            Tiles
          </button>
          <Tooltip label="Toggle OpenStreetMap vectors and labels">
            <button
              type="button"
              onClick={() => setShowVectors((previous) => !previous)}
              aria-pressed={showVectors}
              className={`cursor-pointer rounded border px-2 py-1 text-white transition-colors ${
                showVectors ? 'border-jade-river bg-jade-river/20' : 'border-white/20 hover:bg-white/10'
              }`}
            >
              Vectors
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo map"
            className="cursor-pointer text-white/70 hover:text-white"
          >
            <Cross1Icon />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        aria-label="Photo locations"
        className="relative isolate min-h-40 flex-1 bg-black!"
      />
      <div
        className="max-h-44 shrink-0 space-y-1 overflow-y-auto border-t border-white/10 p-3 text-white/70"
        aria-live="polite"
      >
        <p>{locatedPhotos.length} photo locations. Click overlapping markers to spread them.</p>
        {showTiles && tilesLoading && <p role="status">Loading OpenStreetMap tiles...</p>}
        {showTiles && tilesError && (
          <p className="text-amber-200">
            Some OpenStreetMap tiles failed to load. Toggle Tiles off and on to retry.
          </p>
        )}
        {!locatedPhotos.length && <p>No photos have valid coordinates.</p>}
        {invalidCount > 0 && (
          <p>
            {invalidCount} photos have invalid coordinates and remain available in the filmstrip.
          </p>
        )}
        {locatedPhotos.length > 0 && !activeHasLocation && (
          <p>The selected photo has no valid map location.</p>
        )}
        {showVectors && !bboxKey && <p>Loaded chip bounds are unavailable. OSM data was not requested.</p>}
        {pending > 0 && <p role="status">Loading {pending} OSM layers...</p>}
        {showVectors && bboxKey &&
          pending === 0 &&
          featureCount === 0 &&
          failures.length < MAP_CATEGORIES.length && (
            <p>No loaded OSM features returned for this chip.</p>
          )}
        {failures.map((category) => (
          <p key={category} className="text-amber-200">
            {MAP_CATEGORY_LABELS[category]}: {results[category]?.error}
          </p>
        ))}
        {failures.length > 0 && (
          <button
            type="button"
            onClick={retry}
            className="cursor-pointer underline text-amber-200"
          >
            Retry failed layers
          </button>
        )}
      </div>
    </aside>
  );
}
