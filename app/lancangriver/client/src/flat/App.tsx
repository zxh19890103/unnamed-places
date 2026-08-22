import { LeafletMap } from "./map.js";
import { MapIntroCard } from "./MapIntroCard.js";
import {
  readInitialCenterFromSearch,
  FLAT_CENTER_CONFIRMED,
} from "./protocol.js";
import { useMemo, useState } from "react";
import type { LatLng } from "../calc/types.js";

export default function LeafletApp() {
  const initialCenter = useMemo(
    () =>
      readInitialCenterFromSearch(window.location.search) ?? {
        lat: 22.6273,
        lng: 120.3014,
      },
    [],
  );

  const [mapFocusCenter, setMapFocusCenter] = useState<LatLng | null>(
    initialCenter,
  );

  const confirmCenter = () => {
    window.parent.postMessage(
      {
        type: FLAT_CENTER_CONFIRMED,
        payload: mapFocusCenter,
      },
      window.location.origin,
    );
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <LeafletMap
        initialCenter={initialCenter}
        onCenterChange={setMapFocusCenter}
        focusCenter={mapFocusCenter}
        focusZoom={12}
      />
      <MapIntroCard />
      <div className="absolute bottom-4 right-4 z-500 rounded-xl bg-slate-950/80 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm">
        <div className="font-semibold tracking-wide text-slate-100">
          Confirm center
        </div>
        <div className="mt-1 text-slate-300">
          {mapFocusCenter.lat.toFixed(5)}, {mapFocusCenter.lng.toFixed(5)}
        </div>
        <div className=" flex-col flex gap-2">
          <button
            type="button"
            onClick={confirmCenter}
            className="rounded-lg bg-jade-800 px-3 py-2 font-medium text-jade-text-100 transition-colors hover:bg-jade-600"
          >
            Use this center
          </button>
        </div>
      </div>
    </div>
  );
}
