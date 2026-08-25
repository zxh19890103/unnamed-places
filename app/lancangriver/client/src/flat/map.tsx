import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import type { LatLng } from '../calc/types';

const INITIAL_ZOOM = 8;
const FOOTBALL_MARKER_ICON = L.divIcon({
  html: `<img src="/marker.svg" style="width: 100%" />`,
  iconSize: [44, 56],
  className: 'spin-when-moving',
  iconAnchor: [22, 52],
  popupAnchor: [0, -46],
});

type LeafletMapProps = {
  initialCenter: LatLng;
  onCenterChange: (center: LatLng) => void;
  focusCenter?: LatLng | null;
  focusZoom?: number;
  features?: GeoJSON.Feature[];
};

export function LeafletMap({
  initialCenter,
  onCenterChange,
  focusCenter,
  focusZoom,
}: LeafletMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    const centerTuple: L.LatLngTuple = [initialCenter.lat, initialCenter.lng];

    const map = L.map(mapElementRef.current, {
      center: centerTuple,
      zoom: INITIAL_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
      maxNativeZoom: 21,
      // zoomOffset: 0,
      detectRetina: true,
    }).addTo(map);

    const marker = L.marker(centerTuple, {
      draggable: false,
      icon: FOOTBALL_MARKER_ICON,
    }).addTo(map);

    map.on('click', (event) => {
      marker.setLatLng(event.latlng);
      onCenterChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;
    onCenterChange(initialCenter);

    return () => {
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initialCenter, onCenterChange]);

  useEffect(() => {
    if (!mapRef.current || !focusCenter) {
      return;
    }

    const centerTuple: L.LatLngTuple = [focusCenter.lat, focusCenter.lng];
    const nextZoom = focusZoom ?? mapRef.current.getZoom();

    markerRef.current?.setLatLng(centerTuple);
    mapRef.current.flyTo(centerTuple, nextZoom);
  }, [focusCenter, focusZoom, onCenterChange]);

  return <div ref={mapElementRef} className="h-full w-full" />;
}
