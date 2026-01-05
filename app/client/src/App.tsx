import { memo, useEffect, useState } from "react";
import "./app.scss";

import * as L from "leaflet";
import TileView from "./TileView.js";
import { GeoMap } from "./GeoMap.js";

import * as suncalc from "suncalc";

import "./glsl-chunks/index.js";

export function App() {
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
