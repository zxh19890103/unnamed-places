import { useEffect, useRef } from 'react';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';

import type { JourneyBuildResult } from '@/photos/types';
import { BASE_URL } from '@/calc/constants';

type PhotosLoadMessage = {
  type?: string;
  data?: JourneyBuildResult;
};

const DEFAULT_CENTER: [number, number] = [22.85, 100.97];
const DEFAULT_ZOOM = 10;

export default function App() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      detectRetina: true,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const markers = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    markersRef.current = markers;

    const handleMessage = (event: MessageEvent<PhotosLoadMessage>) => {
      const msg = event.data;

      if (!msg || msg.type !== 'photos-load') {
        return;
      }

      const photos = msg.data.geoNodes;

      if (!photos.length) {
        markers.clearLayers();
        return;
      }

      markers.clearLayers();

      const bounds = L.latLngBounds([] as L.LatLng[]);
      let validCount = 0;

      const onClick = (event) => {
        const cls = event.sourceTarget._icon.className.split(/\s+/g);
        const targetCls = cls.find((c) => c.startsWith('chip-'));
        if (!targetCls) return;
        const chipKey = targetCls.replace('chip-', '').replace('_', ', ');
        const geoNode = photos.find((p) => p.chipKey === chipKey);
        if (!geoNode) return;

        window.parent.postMessage({
          type: 'chip-select',
          data: geoNode.chipKey,
        });
      };

      for (const photo of photos) {
        const lat = Number(photo?.representativeLat);
        const lng = Number(photo?.representativeLng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const photoUrl = getPhotoUrl(photo.photos[0].filePath);

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: `photo-badge-icon chip-${photo.chipKey.replace(', ', '_')}`,
            html: `
            <div class=" overflow-hidden  size-12 relative flex items-center justify-center rounded-full border-2 border-slate-5 shadow-md">
              <img class=" object-cover w-full h-auto" src="${photoUrl}" />
              <div class=" absolute  text-xl font-semibold text-jade-100 size-full leading-12!  text-center left-0 top-0">${photo.photoCount ?? 0}</div>
            </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12],
          }),
        }).addEventListener('click', onClick);

        marker.addTo(markers);
        bounds.extend([lat, lng]);
        validCount += 1;
      }

      if (validCount > 0 && bounds.isValid()) {
        map.fitBounds(bounds.pad(0.3), { maxZoom: 16 });
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      markers.clearLayers();
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = null;
    };
  }, []);

  return (
    <main className=" h-screen bg-slate-950 text-slate-50">
      <div ref={mapRef} className=" h-full w-full overflow-hidden bg-slate-900" />
    </main>
  );
}

function getPhotoUrl(filePath: string): string {
  return `${BASE_URL}/photos/thumb/${encodeURIComponent(filePath)}`;
}
