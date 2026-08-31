import { useEffect, useRef } from 'react';
import L from 'leaflet';

import { START_CENTER_LAT, START_CENTER_LON } from '@/calc/constants';

type LatLngSetter = (lat: number, lng: number) => void;

type LeafletWindow = Window & {
  __setLatlng__?: LatLngSetter;
};

const DEFAULT_ZOOM = 11;
const DEFAULT_CENTER: [number, number] = [START_CENTER_LAT, START_CENTER_LON];

export default function App() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const latestCenterRef = useRef<[number, number]>(DEFAULT_CENTER);

  useEffect(() => {
    if (!mapElementRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      zoomDelta: 1,
      zoomSnap: 0.5,
      attributionControl: true,
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
      maxNativeZoom: 21,
      // zoomOffset: 0,
      detectRetina: false,
    }).addTo(map);

    const marker = L.marker(DEFAULT_CENTER, {
      icon: L.divIcon({
        className: 'static-map-marker',
        html: `<svg aria-hidden="true" viewBox="0 0 32 40" width="32" height="40" xmlns="http://www.w3.org/2000/svg"><path d="M16 1C8.3 1 2 7.3 2 15c0 10.2 14 23 14 23s14-12.8 14-23C30 7.3 23.7 1 16 1Z" fill="#0ea5e9" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="#082f49" stroke="#fff" stroke-width="2"/></svg>`,
        iconSize: [32, 40],
        iconAnchor: [16, 38],
      }),
    }).addTo(map);

    map.dragging.disable();
    map.touchZoom.disable();
    // map.doubleClickZoom.disable();
    // map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.tapHold?.disable();

    mapRef.current = map;

    const setLatlng: LatLngSetter = (lat, lng) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      latestCenterRef.current = [lat, lng];
      map.setView(latestCenterRef.current);
      marker.setLatLng(latestCenterRef.current);
    };

    const leafletWindow = window as LeafletWindow;
    leafletWindow.__setLatlng__ = setLatlng;
    setLatlng(...latestCenterRef.current);

    return () => {
      if (leafletWindow.__setLatlng__ === setLatlng) {
        delete leafletWindow.__setLatlng__;
      }
      mapRef.current = null;
      map.remove();
    };
  }, []);

  return <main ref={mapElementRef} className="h-screen w-screen" />;
}
