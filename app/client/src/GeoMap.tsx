import * as L from "leaflet";
import { memo, useEffect } from "react";

export const GeoMap = memo(
  (props: { onDetermine: (latlng: L.LatLng) => void }) => {
    useEffect(() => {
      const map = L.map("map", {
        doubleClickZoom: false,
        attributionControl: true,
      }).setView([22.056883427333975, 107.13509658925432], 12);

      L.tileLayer(
        // "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&scale=2&hl=en",
        "/gootile/{z}/{x}/{y}?scale=2",
        {
          maxZoom: 21,
          attribution:
            '&copy; <a target="_blank" href="https://www.google.com/intl/en_ALL/help/terms_maps/">Google Map</a>',
        }
      ).addTo(map);

      map.addEventListener("dblclick", (event) => {
        props.onDetermine(event.latlng);
      });
    }, []);

    return <div id="map" className="size-full" />;
  }
);
