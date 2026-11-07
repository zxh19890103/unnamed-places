import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import type { PhotoRecord } from '@/photos/types';
import type { BBox } from '../_tile';
import { getPhotoUrl } from '../_fns';
import { hasPhotoLocation, MAP_CATEGORIES, MAP_CATEGORY_LABELS } from '../_photoMap';
import { usePhotoMapLayers } from '../photo-map/usePhotoMapLayers';
import { usePhotoMapTiles } from '../photo-map/usePhotoMapTiles';
import { Tooltip } from '@/_components/Tooltip';
import { formatCaptureTime, hasSequenceLink, type JourneyMoment } from './_journey';
import 'leaflet/dist/leaflet.css';

interface JourneyMapProps {
  moments: JourneyMoment[];
  activeIndex: number;
  activePhoto: PhotoRecord;
  colors: Map<string, string>;
  osmBbox: BBox | null;
  onSelect: (photo: PhotoRecord) => void;
}

export function JourneyMap({
  moments, activeIndex, activePhoto, colors, osmBbox, onSelect,
}: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const initializedRef = useRef(false);
  const [fitRequest, setFitRequest] = useState(0);
  const [showTiles, setShowTiles] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [0, 0], zoom: 2, minZoom: 1, maxZoom: 20,
      zoomControl: false, preferCanvas: true,
    });
    map.attributionControl.addAttribution(
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    );
    for (const [pane, zIndex] of [
      ['natural_water', 210], ['waters', 220], ['highways', 230],
      ['labels', 350], ['places', 400], ['legs', 450], ['photos', 500],
    ] as const) {
      const element = map.createPane(`photo-map-${pane}`);
      element.style.zIndex = String(zIndex);
      if (zIndex < 450) element.style.opacity = '0.5';
    }
    mapRef.current = map;
    initializedRef.current = false;
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const layers = usePhotoMapLayers(mapRef, osmBbox);
  const tiles = usePhotoMapTiles(mapRef, showTiles);
  const previousFitRef = useRef(fitRequest);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    const nearby = moments.slice(Math.max(0, activeIndex - 2), activeIndex + 3);
    const positions: L.LatLng[] = [];
    const activeMoment = moments[activeIndex];
    const hasLocation = hasPhotoLocation(activePhoto);
    const activePosition = hasLocation ? L.latLng(activePhoto.lat, activePhoto.lng) : null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const origin = initializedRef.current ? map.getCenter().lng
      : activePosition?.lng ?? nearby.find((moment) => hasPhotoLocation(moment.photos[0]))?.photos[0].lng ?? 0;
    const positionFor = (photo: PhotoRecord) => L.latLng(
      photo.lat, photo.lng + 360 * Math.round((origin - photo.lng) / 360),
    );

    nearby.forEach((moment, index) => {
      const selected = moment === activeMoment;
      const photo = selected ? activePhoto : moment.photos[0];
      if (!hasPhotoLocation(photo)) return;
      const position = positionFor(photo);
      positions.push(position);
      const color = colors.get(photo.id) ?? '#a8a29e';
      const previous = nearby[index - 1];
      if (previous && hasSequenceLink(previous, moment)) {
        const from = previous.photos[previous.photos.length - 1];
        const start = positionFor(from);
        // Use the nearest wrapped longitude so dateline crossings do not span the world.
        const end = L.latLng(position.lat,
          position.lng + 360 * Math.round((start.lng - position.lng) / 360));
        const startColor = colors.get(from.id) ?? color;
        const midpoint = L.latLng((start.lat + end.lat) / 2, (start.lng + end.lng) / 2);
        for (const [points, shade] of [
          [[start, midpoint], startColor], [[midpoint, end], color],
        ] as const) {
          for (const stroke of [
            { color: '#ffffff', weight: 11, opacity: 0.9 },
            { color: '#1c1917', weight: 8, opacity: 1 },
            { color: shade, weight: 5, opacity: 1 },
          ]) {
            L.polyline([...points], {
              pane: 'photo-map-legs', ...stroke,
              dashArray: '10 10', lineCap: 'butt', interactive: false,
            }).addTo(group);
          }
        }
      }
      const width = selected ? 80 : 64;
      const height = selected ? 60 : 48;
      const sequence = moments.indexOf(moment) + 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'relative block cursor-pointer rounded-md border-2 bg-stone-900 shadow-lg focus-visible:outline-2 focus-visible:outline-white';
      button.style.width = `${width}px`;
      button.style.height = `${height}px`;
      button.style.borderColor = selected ? '#fbbf24' : color;
      if (selected) {
        button.style.boxShadow = '0 0 0 3px #1c1917, 0 0 0 6px #fbbf24, 0 6px 20px #0009';
      }
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label',
        `${selected ? 'Selected' : 'View'} moment ${sequence}: ${formatCaptureTime(photo)}, ${moment.photos.length} photos`);
      const image = document.createElement('img');
      image.src = getPhotoUrl('thumb', photo.filePath);
      image.alt = '';
      image.className = `h-full w-full rounded-sm object-cover ${
        selected ? '' : 'brightness-65 saturate-50 hover:brightness-100 hover:saturate-100'
      }`;
      image.draggable = false;
      button.append(image);
      const sequenceBadge = document.createElement('span');
      sequenceBadge.className = `absolute -left-2 -top-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-stone-900 ${
        selected ? 'bg-amber-300 text-stone-900' : 'bg-jade-river-700 text-white'
      }`;
      sequenceBadge.textContent = String(sequence);
      button.append(sequenceBadge);
      if (moment.photos.length > 1) {
        const countBadge = document.createElement('span');
        countBadge.className = 'absolute -right-2 -top-2 rounded-full bg-stone-800 px-1.5 py-0.5 text-[10px] font-semibold text-white ring-1 ring-stone-900';
        countBadge.textContent = `x ${moment.photos.length}`;
        button.append(countBadge);
      }
      button.addEventListener('click', () => onSelect(photo));
      const marker = L.marker(position, {
        pane: 'photo-map-photos', keyboard: false, bubblingMouseEvents: false,
        zIndexOffset: selected ? 1000 : 0,
        icon: L.divIcon({
          html: button, className: '', iconSize: [width, height],
          iconAnchor: [width / 2, height / 2],
        }),
      }).addTo(group);
      marker.bindTooltip(
        `${formatCaptureTime(photo)} · ${moment.photos.length} photos`,
        { direction: 'bottom' },
      );
    });
    if (positions.length > 0) {
      const fit = !initializedRef.current || previousFitRef.current !== fitRequest;
      if (fit) {
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [55, 55], maxZoom: 16, animate: false });
        initializedRef.current = true;
      } else if (activePosition) {
        const wrapped = L.latLng(activePosition.lat, activePosition.lng +
          360 * Math.round((map.getCenter().lng - activePosition.lng) / 360));
        map.stop();
        map.panTo(wrapped, { animate: !reducedMotion });
      }
    }
    previousFitRef.current = fitRequest;
    map.fire('photomapmarkerschange');
    return () => { group.remove(); };
  }, [moments, activeIndex, activePhoto, colors, onSelect, fitRequest]);

  const showStatus = !hasPhotoLocation(activePhoto) || !layers.bboxKey ||
    layers.pending > 0 || layers.featureCount === 0 || layers.failures.length > 0 ||
    (showTiles && (tiles.loading || tiles.error));

  return (
    <div className="relative min-h-40 flex-1">
      <div
        ref={containerRef}
        aria-label="Journey moments in space and time"
        className="absolute inset-0 isolate bg-stone-900!"
      />
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex items-start justify-between gap-2">
        <span className="rounded bg-stone-900/90 px-2 py-1 text-[10px] text-white/70">
          North up · Photo sequence, not a recorded route
        </span>
        <div className="pointer-events-auto flex shrink-0 gap-2">
        <Tooltip label="Toggle OpenStreetMap raster tiles">
          <button
            type="button"
            onClick={() => setShowTiles((previous) => !previous)}
            aria-pressed={showTiles}
            className={`cursor-pointer rounded border px-2 py-1 text-white transition-colors ${
              showTiles
                ? 'border-jade-river bg-jade-river/80'
                : 'border-white/20 bg-stone-900/90 hover:bg-stone-800'
            }`}
          >
            Tiles
          </button>
        </Tooltip>
        <button
          type="button"
          onClick={() => setFitRequest((value) => value + 1)}
          className="pointer-events-auto shrink-0 cursor-pointer rounded border border-white/20 bg-stone-900/90 px-2 py-1 text-white hover:bg-stone-800"
        >
          Fit nearby
        </button>
        </div>
      </div>
      {showStatus && (
      <div className="absolute inset-x-3 bottom-7 z-[1000] max-h-24 overflow-y-auto rounded bg-stone-900/90 p-2 text-[10px] text-white/70" aria-live="polite">
        {showTiles && tiles.loading && <p role="status">Loading OpenStreetMap tiles...</p>}
        {showTiles && tiles.error && (
          <p className="text-amber-200">
            Some OpenStreetMap tiles failed to load. Toggle Tiles off and on to retry.
          </p>
        )}
        {!hasPhotoLocation(activePhoto) && <p>Selected photo has no valid location.</p>}
        {!layers.bboxKey && <p>Chip bounds unavailable. OSM background was not requested.</p>}
        {layers.pending > 0 && <p role="status">Loading {layers.pending} OSM layers...</p>}
        {layers.bboxKey && layers.pending === 0 && layers.featureCount === 0 &&
          layers.failures.length < MAP_CATEGORIES.length && <p>No loaded OSM features for this chip.</p>}
        {layers.failures.map((category) => (
          <p key={category} className="text-amber-200">
            {MAP_CATEGORY_LABELS[category]}: {layers.results[category]?.error}
          </p>
        ))}
        {layers.failures.length > 0 && (
          <button type="button" onClick={layers.retry} className="cursor-pointer text-amber-200 underline">
            Retry failed layers
          </button>
        )}
      </div>
      )}
    </div>
  );
}
