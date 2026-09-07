import { LatLng } from '@/calc/types';
import { memo, useEffect, useRef, useState } from 'react';
import { START_CENTER_LAT, START_CENTER_LON } from '@/calc/constants';
import { GlobeIcon } from '@radix-ui/react-icons';
import { Button, ChildWindow } from '@/_components';
import { currentThreeDTilesViewer } from '@/_3dtiles';
import { ExploreControls } from '../controls/ExploreControls.class';

type Props = {
  lat: number;
  lng: number;
};

const defualtLatlng: LatLng = {
  lat: START_CENTER_LAT,
  lng: START_CENTER_LON,
};

export const MiniMap = memo(
  ({ precision, controls }: { controls: ExploreControls; precision: number }) => {
    const [latlng, setLatlng] = useState<LatLng>(defualtLatlng);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
      const handle = () => {
        const latlng0 = currentThreeDTilesViewer.getLatlng();

        const lat = Number(latlng0.lat.toFixed(precision));
        const lng = Number(latlng0.lng.toFixed(precision));

        setLatlng({ lat, lng });
      };

      const handleClick = (event: { latlng: LatLng }) => {
        const latlng0 = event.latlng;
        if (!latlng0) {
          return;
        }

        const lat = Number(latlng0.lat.toFixed(precision));
        const lng = Number(latlng0.lng.toFixed(precision));

        setLatlng({ lat, lng });
      };

      controls.addEventListener('click', handleClick);

      return () => {
        controls.removeEventListener('end', handle);
        controls.removeEventListener('click', handleClick);
      };
    }, [controls, precision]);

    return (
      <div className="">
        <div className=" absolute right-1 top-2">
          {isOpen ? null : (
            <Button
              size="sm"
              className=" whitespace-nowrap"
              onClick={() => setIsOpen(true)}
              aria-expanded={isOpen}
              aria-controls="explorer-mini-map"
            >
              <GlobeIcon />
              Mini map
            </Button>
          )}
        </div>

        {isOpen && <MiniMapLoader onOpenOrClose={setIsOpen} lat={latlng.lat} lng={latlng.lng} />}
      </div>
    );
  },
);

const MiniMapLoader = memo(
  ({ lat, lng, onOpenOrClose }: Props & { onOpenOrClose: (open: boolean) => void }) => {
    const iframeElementRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
      const setLatlng = iframeElementRef.current.contentWindow['__setLatlng__'];
      setLatlng?.(lat, lng);
    }, [lat, lng]);

    return (
      <ChildWindow
        className=" size-108"
        winRole="Following camera"
        title={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
        pageUrl="static-leaflet-map"
        onOpenStateChange={onOpenOrClose}
        iframeElementRef={iframeElementRef}
      />
    );
  },
);
