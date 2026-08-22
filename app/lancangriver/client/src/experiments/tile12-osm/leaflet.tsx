import { useEffect, useMemo, useRef } from "react";
import * as L from "leaflet";

import { getLeafletFeatureStyle } from "./leafletStyle.js";

import "leaflet/dist/leaflet.css";

type LeafletVectorViewerProps = {
  features: GeoJSON.Feature[];
  tileKey: string;
};

export function LeafletVectorViewer({
  features,
  tileKey,
}: LeafletVectorViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);

  const geojson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features,
    }),
    [features],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: true,
      center: [0, 0],
      zoom: 2,
    });

    // L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    //   attribution: "&copy; OpenStreetMap contributors",
    //   maxZoom: 19,
    // }).addTo(map);

    L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Maps",
      subdomains: ["0", "1", "2", "3"],
      maxZoom: 20,
      maxNativeZoom: 21,
      detectRetina: true,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    layerRef.current?.remove();
    layerRef.current = null;

    if (features.length === 0) {
      return;
    }

    const layer = L.geoJSON(geojson, {
      style: (feature) => getLeafletFeatureStyle(feature as GeoJSON.Feature),
    }).addTo(map);

    layerRef.current = layer;

    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [features, geojson]);

  return <div ref={containerRef} className="h-full w-full" />;
}
