import { LatLng } from "@/calc/types";
import { memo, useEffect, useRef, useState } from "react";
import { type ControlsManager } from "../ControlsManager.class";
import { START_CENTER_LAT, START_CENTER_LON } from "@/calc/constants";
import { Cross1Icon } from "@radix-ui/react-icons";

type Props = {
  lat: number;
  lng: number;
};

const defualtLatlng: LatLng = {
  lat: START_CENTER_LAT,
  lng: START_CENTER_LON,
};

export const MiniMap = memo(
  ({
    precision,
    controls,
    positionGetter,
  }: {
    controls: ControlsManager;
    positionGetter: () => LatLng;
    precision: number;
  }) => {
    const [latlng, setLatlng] = useState<LatLng>(defualtLatlng);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
      const handle = () => {
        const latlng0 = positionGetter();

        const lat = Number(latlng0.lat.toFixed(precision));
        const lng = Number(latlng0.lng.toFixed(precision));

        setLatlng({ lat, lng });
      };

      const handleClick = (event: Event & { latlng?: LatLng }) => {
        const latlng0 = event.latlng;
        if (!latlng0) {
          return;
        }

        const lat = Number(latlng0.lat.toFixed(precision));
        const lng = Number(latlng0.lng.toFixed(precision));

        setLatlng({ lat, lng });
      };

      const orbitControls = controls.orbitControls;

      // orbitControls.addEventListener("end", handle);
      const customOrbitControls = orbitControls as typeof orbitControls & {
        addEventListener: (
          type: "click",
          listener: (event: Event & { latlng?: LatLng }) => void,
        ) => void;
        removeEventListener: (
          type: "click",
          listener: (event: Event & { latlng?: LatLng }) => void,
        ) => void;
      };
      customOrbitControls.addEventListener("click", handleClick);

      return () => {
        orbitControls.removeEventListener("end", handle);
        customOrbitControls.removeEventListener("click", handleClick);
      };
    }, [controls, positionGetter]);

    return (
      <>
        {isOpen ? (
          <button
            type="button"
            className="fixed top-18 right-3 z-60 min-h-10 px-3 py-2 rounded-full border border-(--jade-border) bg-(--jade-panel)/95 text-sm font-medium text-(--jade-text) shadow-xl shadow-[#182a36]/20 backdrop-blur-md transition-colors hover:bg-jade-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--jade-river) sm:top-3 sm:right-4"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls="explorer-mini-map"
          >
            <Cross1Icon />
          </button>
        ) : (
          <button
            type="button"
            className="fixed top-18 right-3 z-60 min-h-10 rounded-lg border border-(--jade-border) bg-(--jade-panel)/95 px-3 py-2 text-sm font-medium text-(--jade-text) shadow-xl shadow-[#182a36]/20 backdrop-blur-md transition-colors hover:bg-jade-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--jade-river) sm:top-3 sm:right-4"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls="explorer-mini-map"
          >
            Mini map
          </button>
        )}

        {isOpen && <MiniMapLoader lat={latlng.lat} lng={latlng.lng} />}
      </>
    );
  },
);

const MiniMapLoader = memo(({ lat, lng }: Props) => {
  const iframeElementRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const setLatlng = iframeElementRef.current.contentWindow["__setLatlng__"];
    setLatlng?.(lat, lng);
  }, [lat, lng]);

  return (
    <div
      id="explorer-mini-map"
      className="fixed right-3 bottom-3 z-50 flex h-[min(65vh,36rem)] w-[min(36rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-(--jade-border) bg-(--jade-panel) text-(--jade-text) shadow-2xl shadow-[#182a36]/25 sm:top-3 sm:right-4 sm:bottom-auto"
    >
      <header className="flex min-h-12 items-center border-b border-(--jade-border-soft) px-3 pr-32">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-(--jade-river) uppercase">
            Following camera
          </p>
          <p className="truncate text-xs font-semibold tabular-nums">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 bg-(--jade-depth)">
        <iframe
          title="Explorer mini map"
          className="h-full w-full border-none"
          src="/static-leaflet-map"
          ref={iframeElementRef}
          onLoad={() => setIsLoading(false)}
        />
        {isLoading && (
          <div
            className="absolute inset-0 grid place-items-center bg-(--jade-depth) text-xs text-(--jade-text-muted)"
            role="status"
          >
            Loading mini map...
          </div>
        )}
      </div>
    </div>
  );
});
