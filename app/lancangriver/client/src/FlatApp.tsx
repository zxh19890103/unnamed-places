import { LeafletMap } from "./flat/map.js";
import { MapIntroCard } from "./flat/MapIntroCard.js";

export default function LeafletApp() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <LeafletMap />
      <MapIntroCard />
    </div>
  );
}
