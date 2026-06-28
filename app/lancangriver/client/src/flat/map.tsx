import { useEffect, useRef } from "react";
import * as L from "leaflet";

const INITIAL_CENTER: L.LatLngTuple = [22.6273, 120.3014];
const INITIAL_ZOOM = 8;

export function LeafletMap() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, {
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    L.marker(INITIAL_CENTER)
      .addTo(map)
      .bindPopup("Leaflet standalone app")
      .openPopup();

    mapRef.current = map;

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={mapElementRef} className="h-full w-full" />;
}
