import { memo, useEffect, useState } from "react";
import "./app.scss";

import * as L from "leaflet";
import Detail from "./Detail.js";

export function App() {
  const [latlng, setLatlng] = useState<L.LatLng>(null);

  return (
    <div className="App flex items-stretch flex-nowrap w-screen h-screen font-semibold">
      <div className="flex-1 w-1/2">
        <GeoMap onDetermine={setLatlng} />
      </div>
      <div className="flex-1 w-1/2">
        <Detail latlng={latlng} />
      </div>
    </div>
  );
}

const GeoMap = memo((props: { onDetermine: (latlng: L.LatLng) => void }) => {
  useEffect(() => {
    const map = L.map("map", {
      doubleClickZoom: false,
      attributionControl: true,
    }).setView([51.505, -0.09], 12);

    L.tileLayer(
      "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&scale=2&hl=en",
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
});
