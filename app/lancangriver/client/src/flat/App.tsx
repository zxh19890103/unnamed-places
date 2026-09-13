import { LeafletMap } from './map.js';
import { MapIntroCard } from './MapIntroCard.js';
import { readInitialCenterFromSearch, FLAT_CENTER_CONFIRMED } from './protocol.js';
import { useMemo, useState } from 'react';
import type { LatLng } from '../calc/types.js';
import { Button } from '../_components/Button.js';

export default function LeafletApp() {
  const initialCenter = useMemo(
    () =>
      readInitialCenterFromSearch(window.location.search) ?? {
        lat: 22.6273,
        lng: 120.3014,
      },
    [],
  );

  const [mapFocusCenter, setMapFocusCenter] = useState<LatLng | null>(initialCenter);

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
    <main className="relative h-screen w-screen overflow-hidden bg-jade-foundation text-jade-text">
      <LeafletMap
        initialCenter={initialCenter}
        onCenterChange={setMapFocusCenter}
        focusCenter={mapFocusCenter}
        focusZoom={12}
      />
      <MapIntroCard />
      <section className="absolute right-3 bottom-8 z-500 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-jade-border bg-jade-panel/95 p-3 text-sm shadow-[0_8px_24px_rgba(24,42,54,0.14)] backdrop-blur-md sm:right-4">
        <h2 className="font-semibold">Confirm center</h2>
        <div className="mt-1 tabular-nums text-jade-text-muted">
          {mapFocusCenter.lat.toFixed(5)}, {mapFocusCenter.lng.toFixed(5)}
        </div>
        <div className="mt-3 flex">
          <Button type="button" variant="primary" size="sm" onClick={confirmCenter}>
            Use this center
          </Button>
        </div>
      </section>
    </main>
  );
}
