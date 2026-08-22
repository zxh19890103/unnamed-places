import { useEffect, useRef } from "react";
import * as L from "leaflet";
import type { BBox, LatLng } from "./bbox.js";
import { tileBounds4326 } from "../calc/mercator.js";

const LATLNG_FOCUS_ZOOM = 15;

type LeafletBBoxMapProps = {
  bbox: BBox;
  latlng: LatLng | null;
  focusTile: string | null;
  onBoundsChange: (bounds: BBox) => void;
};

export function LeafletBBoxMap({
  focusTile,
  bbox,
  latlng,
  onBoundsChange,
}: LeafletBBoxMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const focusRectRef = useRef<L.Rectangle | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, { zoomControl: true });

    L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Maps",
      subdomains: ["0", "1", "2", "3"],
      maxZoom: 20,
      maxNativeZoom: 21,
      detectRetina: true,
    }).addTo(map);

    const reportBounds = () => {
      const visible = map.getBounds();
      onBoundsChange({
        west: visible.getWest(),
        south: visible.getSouth(),
        east: visible.getEast(),
        north: visible.getNorth(),
      });
    };

    // latlng takes priority over bbox when both are provided
    if (latlng) {
      map.setView([latlng.lat, latlng.lng], LATLNG_FOCUS_ZOOM);
    } else {
      L.rectangle(
        [
          [bbox.south, bbox.west],
          [bbox.north, bbox.east],
        ],
        { color: "#22d3ee", weight: 2, fillOpacity: 0.08 },
      ).addTo(map);

      map.fitBounds([
        [bbox.south, bbox.west],
        [bbox.north, bbox.east],
      ]);
    }

    reportBounds();

    map.on("moveend", reportBounds);

    mapRef.current = map;

    return () => {
      map.off("moveend", reportBounds);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    focusRectRef.current?.remove();
    focusRectRef.current = null;

    if (!focusTile) {
      return;
    }

    const [z, x, y] = focusTile.split("/").map(Number);
    const [west, south, east, north] = tileBounds4326(z, x, y);

    focusRectRef.current = L.rectangle(
      [
        [south, west],
        [north, east],
      ],
      { color: "#facc15", weight: 2, fillColor: "#facc15", fillOpacity: 0.25 },
    ).addTo(mapRef.current);
  }, [focusTile]);

  return <div ref={mapElementRef} className="h-full w-full" />;
}
