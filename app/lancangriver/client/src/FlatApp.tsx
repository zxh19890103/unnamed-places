import { LeafletMap } from "./flat/map.js";
import { MapIntroCard } from "./flat/MapIntroCard.js";
import {
  readInitialCenterFromSearch,
  FLAT_CENTER_CONFIRMED,
} from "./flat/protocol.js";
import { useMemo, useState } from "react";
import type { LatLng } from "./calc/types";

export default function LeafletApp() {
  const initialCenter = useMemo(
    () =>
      readInitialCenterFromSearch(window.location.search) ?? {
        lat: 22.6273,
        lng: 120.3014,
      },
    [],
  );
  const [selectedCenter, setSelectedCenter] = useState<LatLng>(initialCenter);

  const confirmCenter = () => {
    window.parent.postMessage(
      {
        type: FLAT_CENTER_CONFIRMED,
        payload: selectedCenter,
      },
      window.location.origin,
    );
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <LeafletMap
        initialCenter={initialCenter}
        onCenterChange={setSelectedCenter}
      />
      <MapIntroCard />
      <div className="absolute bottom-4 right-4 z-[500] rounded-xl bg-slate-950/80 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm">
        <div className="font-semibold tracking-wide text-slate-100">
          Confirm center
        </div>
        <div className="mt-1 text-slate-300">
          {selectedCenter.lat.toFixed(5)}, {selectedCenter.lng.toFixed(5)}
        </div>
        <button
          type="button"
          onClick={confirmCenter}
          className="mt-3 rounded-lg bg-sky-500 px-3 py-2 font-medium text-slate-950 transition-colors hover:bg-sky-400"
        >
          Use this center
        </button>
      </div>
    </div>
  );
}
