import { LatLng } from "@/calc/types";
import { memo, useEffect, useRef, useState } from "react";
import { type ControlsManager } from "../ControlsManager.class";
import { START_CENTER_LAT, START_CENTER_LON } from "@/calc/constants";

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

      orbitControls.addEventListener("end", handle);
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
        <button
          type="button"
          className="fixed rounded-xl right-4 top-4 z-60 border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-white shadow-lg"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? "Close" : "Open Mini map"}
        </button>
        {isOpen && <MiniMapLoader lat={latlng.lat} lng={latlng.lng} />}
      </>
    );
  },
);

const MiniMapLoader = memo(({ lat, lng }: Props) => {
  const iframeElementRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const setLatlng = iframeElementRef.current.contentWindow["__setLatlng__"];
    setLatlng?.(lat, lng);
  }, [lat, lng]);

  return (
    <div className="fixed right-4 top-4 z-50 h-144 w-xl overflow-hidden rounded-xl">
      <iframe
        className="w-full h-full border-none"
        src="/static-leaflet-map"
        ref={iframeElementRef}
      />
    </div>
  );
});
