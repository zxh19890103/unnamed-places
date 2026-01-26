import { useState } from "react";
import "./app.scss";

import * as L from "leaflet";
import TileView from "./TileView.js";
import { GeoMap } from "./GeoMap.js";

import "./glsl-chunks/index.js";

export function App2() {
  const [latlng, setLatlng] = useState<L.LatLng>(null);

  return (
    <div className="App flex items-stretch flex-nowrap w-screen h-screen font-semibold">
      <div className="flex-1 w-1/2">
        <GeoMap onDetermine={setLatlng} />
      </div>
      <div className=" relative flex-1 w-1/2">
        <TileView latlng={latlng} />
      </div>
    </div>
  );
}

// const center = L.latLng(29.553982220194015, 106.57553820682898);
// const center = L.latLng(22.182343221117133, 107.03785982550292);
// const center = L.latLng(22.213771151724906, 106.96811747344715);
// const center = L.latLng(23.871900680266624, 100.06033123411747);
// const center = L.latLng(23.896909118553555, 100.14712706942368);
// const center = L.latLng(23.36612409576317, 103.39632985556513);
// const center = L.latLng(22.210827162912356, 106.70117382328893);
// const center = L.latLng(25.048382114245637, 102.70314327756041);
const center = L.latLng(25.106396061591024, 102.22238157069054);

export function App() {
  return (
    <div className=" relative w-screen h-screen">
      <TileView latlng={center} />
    </div>
  );
}
