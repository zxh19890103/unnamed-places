import { useEffect, useRef } from 'react';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';

import type {
  JourneyBuildResult,
  PhotoChip,
  PhotoChipHierarchy,
  PhotoChipSelection,
  PhotoRecord,
} from '@/photos/types';
import { buildPhotoChipHierarchy, getChipLevelForMapZoom } from '@/photos/chips';
import { BASE_URL } from '@/calc/constants';

type PhotosLoadMessage = {
  type?: string;
  data?: JourneyBuildResult;
  revision?: string;
};

const DEFAULT_CENTER: [number, number] = [22.85, 100.97];
const DEFAULT_ZOOM = 10;

export default function App() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const hierarchyRef = useRef<PhotoChipHierarchy | null>(null);
  const revisionRef = useRef<string>('');
  const renderedMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapRef.current) return;

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
      maxNativeZoom: 21,
      detectRetina: true,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    markersRef.current = markersGroup;

    const reconcileMarkers = () => {
      const hierarchy = hierarchyRef.current;
      if (!hierarchy || hierarchy.totalValidPhotos === 0) {
        markersGroup.clearLayers();
        renderedMarkersRef.current.clear();
        return;
      }

      const zoom = map.getZoom();
      const chipLevel = getChipLevelForMapZoom(zoom, hierarchy.minLevel, hierarchy.maxLevel);

      // Render only the selected level's visible chips with a viewport margin (0.35 padding)
      const viewportBounds = map.getBounds().pad(0.35);
      const chipsAtLevel = hierarchy.chipsByLevel.get(chipLevel);

      const visibleChips: PhotoChip[] = [];
      if (chipsAtLevel) {
        for (const chip of chipsAtLevel.values()) {
          if (viewportBounds.contains([chip.representativeLat, chip.representativeLng])) {
            visibleChips.push(chip);
          }
        }
      }

      const rendered = renderedMarkersRef.current;
      const nextVisibleIds = new Set(visibleChips.map((c) => c.id));

      // Remove markers that are no longer visible or belong to a different level
      for (const [id, marker] of rendered.entries()) {
        if (!nextVisibleIds.has(id)) {
          markersGroup.removeLayer(marker);
          rendered.delete(id);
        }
      }

      // Add new markers for newly visible chips, reusing existing markers
      for (const chip of visibleChips) {
        if (!rendered.has(chip.id)) {
          const marker = createChipMarker(chip, hierarchy);
          marker.addTo(markersGroup);
          rendered.set(chip.id, marker);
        }
      }
    };

    const handleChipClick = (chip: PhotoChip) => {
      const hierarchy = hierarchyRef.current;
      if (!hierarchy) return;

      const currentRevision = revisionRef.current;

      // 1. Single-photo chip: select that photo
      if (chip.photoCount === 1) {
        const selection: PhotoChipSelection = {
          chipId: chip.id,
          revision: currentRevision,
          selectionType: 'single-photo',
          photoIds: [chip.representativePhotoId],
          representativePhotoId: chip.representativePhotoId,
          representativeLat: chip.representativeLat,
          representativeLng: chip.representativeLng,
        };

        window.parent.postMessage({ type: 'photo-chip-select', ...selection }, '*');
        window.parent.postMessage({ type: 'chip-select', data: chip.id }, '*');
        return;
      }

      // 2. Finest-level multi-photo chip or co-located cluster that cannot split further
      const isFinestLevel = chip.level >= hierarchy.maxLevel;
      const cannotSplit =
        chip.childIds.length <= 1 &&
        chip.bounds.minLat === chip.bounds.maxLat &&
        chip.bounds.minLng === chip.bounds.maxLng;

      if (isFinestLevel || cannotSplit) {
        const memberPhotoIds = hierarchy.chipPhotoIds.get(chip.id) ?? [chip.representativePhotoId];

        const selection: PhotoChipSelection = {
          chipId: chip.id,
          revision: currentRevision,
          selectionType: 'multi-photo',
          photoIds: memberPhotoIds,
          representativePhotoId: chip.representativePhotoId,
          representativeLat: chip.representativeLat,
          representativeLng: chip.representativeLng,
        };

        window.parent.postMessage({ type: 'photo-chip-select', ...selection }, '*');
        window.parent.postMessage({ type: 'chip-select', data: chip.id }, '*');
        return;
      }

      // 3. Aggregate chip: click to zoom into its member bounds and reveal finer chips
      const corner1 = L.latLng(chip.bounds.minLat, chip.bounds.minLng);
      const corner2 = L.latLng(chip.bounds.maxLat, chip.bounds.maxLng);
      const memberBounds = L.latLngBounds(corner1, corner2);

      const targetZoom = map.getBoundsZoom(memberBounds.pad(0.25));
      if (targetZoom > map.getZoom()) {
        map.fitBounds(memberBounds.pad(0.25), { maxZoom: 19, animate: true });
      } else {
        map.setView(
          [chip.representativeLat, chip.representativeLng],
          Math.min(map.getZoom() + 2, 19),
          { animate: true },
        );
      }
    };

    const createChipMarker = (chip: PhotoChip, hierarchy: PhotoChipHierarchy): L.Marker => {
      const repPhoto = hierarchy.photoMap.get(chip.representativePhotoId);
      const photoUrl = repPhoto ? getPhotoUrl(repPhoto.filePath) : '';

      const badgeHtml = `
        <div class="photo-badge-wrapper relative size-12 cursor-pointer select-none rounded-full border border-slate-700 transition-transform hover:scale-110 active:scale-95 overflow-hidden" title="${chip.photoCount} photo${chip.photoCount > 1 ? 's' : ''}">
          <img class=" w-full object-cover pointer-events-none" src="${photoUrl}" alt="Photo" />
          ${
            chip.photoCount > 1
              ? `<div class="absolute inset-0 flex items-center justify-center">
                  <span class="text-sm font-bold text-white">
                    ${chip.photoCount}
                  </span>
                </div>`
              : ''
          }
        </div>
      `;

      const icon = L.divIcon({
        className: 'photo-badge-marker',
        html: badgeHtml,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });

      const marker = L.marker([chip.representativeLat, chip.representativeLng], {
        icon,
      });

      marker.on('click', () => {
        handleChipClick(chip);
      });

      return marker;
    };

    const handleMessage = (event: MessageEvent<PhotosLoadMessage>) => {
      const msg = event.data;
      if (!msg || msg.type !== 'photos-load' || !msg.data) {
        return;
      }

      const records: PhotoRecord[] = msg.data.records ?? [];
      const newRevision = msg.revision ?? msg.data.lodHierarchy?.revision ?? `rev-${Date.now()}`;

      const isNewDataset = newRevision !== revisionRef.current;
      revisionRef.current = newRevision;

      // Use hierarchy from message if valid, otherwise build from records
      const hierarchy =
        msg.data.lodHierarchy && msg.data.lodHierarchy.allChips?.size > 0
          ? msg.data.lodHierarchy
          : buildPhotoChipHierarchy(records, { revision: newRevision });

      hierarchyRef.current = hierarchy;

      // Fit bounds only when a new dataset arrives, never during LOD updates or pans/zooms
      if (isNewDataset && records.length > 0) {
        const bounds = L.latLngBounds([] as L.LatLng[]);
        for (const p of records) {
          if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
            bounds.extend([p.lat, p.lng]);
          }
        }
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.25), { maxZoom: 16 });
        }
      }

      reconcileMarkers();
    };

    map.on('zoomend moveend', reconcileMarkers);
    window.addEventListener('message', handleMessage);

    // Ready handshake: notify parent that the map app is ready to receive data
    window.parent.postMessage({ type: 'photos-map-ready' }, '*');

    return () => {
      map.off('zoomend moveend', reconcileMarkers);
      window.removeEventListener('message', handleMessage);
      markersGroup.clearLayers();
      renderedMarkersRef.current.clear();
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = null;
      hierarchyRef.current = null;
    };
  }, []);

  return (
    <main className="h-screen bg-slate-950 text-slate-50">
      <div ref={mapRef} className="h-full w-full overflow-hidden bg-slate-900" />
    </main>
  );
}

function getPhotoUrl(filePath: string): string {
  return `${BASE_URL}/photos/thumb/${encodeURIComponent(filePath)}`;
}
