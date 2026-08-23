import { useEffect, useRef } from "react";
import * as L from "leaflet";
import type { BBox, LatLng } from "./bbox.js";
import { tileBounds4326, tileXY as mercatorTileXY } from "../calc/mercator.js";
import type { TileKey } from "./tiles.js";

const LATLNG_FOCUS_ZOOM = 15;
const COVERAGE_ZOOM = 12;

type LeafletBBoxMapProps = {
  bbox: BBox;
  latlng: LatLng | null;
  focusTile: string | null;
  manualTiles: TileKey[];
  onBoundsChange: (bounds: BBox) => void;
  onTileAdd: (tile: TileKey) => void;
};

export function LeafletBBoxMap({
  focusTile,
  bbox,
  latlng,
  manualTiles,
  onBoundsChange,
  onTileAdd,
}: LeafletBBoxMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const focusRectRef = useRef<L.Rectangle | null>(null);
  const manualRectsRef = useRef<L.Rectangle[]>([]);

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

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      const tile = tileKeyAtLatLng(COVERAGE_ZOOM, lat, lng);
      onTileAdd(tile);
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
    map.on("click", handleMapClick);

    mapRef.current = map;

    return () => {
      map.off("moveend", reportBounds);
      map.off("click", handleMapClick);
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

    mapRef.current.flyTo([south, west], 11);
  }, [focusTile]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    manualRectsRef.current.forEach((rect) => rect.remove());
    manualRectsRef.current = [];

    manualTiles.forEach((tile) => {
      const [west, south, east, north] = tileBounds4326(tile.z, tile.x, tile.y);

      const rect = L.rectangle(
        [
          [south, west],
          [north, east],
        ],
        {
          color: "#ade01a",
          weight: 2,
          fillColor: "#ade01a",
          fillOpacity: 0.18,
        },
      ).addTo(mapRef.current!);

      manualRectsRef.current.push(rect);
    });
  }, [manualTiles]);

  return <div ref={mapElementRef} className="h-full w-full" />;
}

function tileKeyAtLatLng(zoom: number, lat: number, lng: number): TileKey {
  const { x, y } = mercatorTileXY(lng, lat, zoom);
  return { z: zoom, x, y, id: `${zoom}/${x}/${y}` };
}
