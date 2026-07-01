import { useEffect, useRef } from "react";
import * as L from "leaflet";
import type { LatLng } from "../calc/types";

const INITIAL_ZOOM = 8;
const FOOTBALL_MARKER_ICON = L.divIcon({
  html: `<img src="/marker.svg" style="width: 100%" />`,
  iconSize: [44, 56],
  className: "spin-when-moving",
  iconAnchor: [22, 52],
  popupAnchor: [0, -46],
});

type LeafletMapProps = {
  initialCenter: LatLng;
  onCenterChange: (center: LatLng) => void;
};

export function LeafletMap({ initialCenter, onCenterChange }: LeafletMapProps) {
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

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(centerTuple, {
      draggable: true,
      icon: FOOTBALL_MARKER_ICON,
    })
      .addTo(map)
      .bindPopup("Drag to choose a center")
      .openPopup();

    marker.on("dragend", () => {
      const center = marker.getLatLng();
      onCenterChange({ lat: center.lat, lng: center.lng });
    });

    map.on("click", (event) => {
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

  return <div ref={mapElementRef} className="h-full w-full" />;
}
