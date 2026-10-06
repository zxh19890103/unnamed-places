import * as THREE from 'three';
import { memo, useEffect, useRef, useState } from 'react';
import { ChildWindow } from '@/_components/Window';
import { Button } from '@/_components/Button';
import { Tooltip } from '@/_components/Tooltip';
import type { JourneyBuildResult } from '@/photos/types';
import { LatLng } from './_tile';

type Props = { data: JourneyBuildResult; onChipKeySelect: (key: string) => void };

export const LoadFlatMap = memo(({ data, onChipKeySelect }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sentRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      sentRef.current = false;
      return;
    }

    const sendMockData = () => {
      if (!iframeRef.current?.contentWindow || sentRef.current) {
        return;
      }

      sentRef.current = true;
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'photos-load',
          data: data,
        },
        window.location.origin,
      );
    };

    const frame = iframeRef.current;
    if (!frame) {
      return;
    }

    // frame.addEventListener('load', sendMockData, { once: true });
    const timer = window.setTimeout(sendMockData, 150);

    const handleMsg = (event) => {
      const type = event.data.type;
      if (type === 'chip-select') {
        const chipKey = event.data.data;
        onChipKeySelect(chipKey);
      }
    };

    window.addEventListener('message', handleMsg);

    return () => {
      window.removeEventListener('message', handleMsg);
      window.clearTimeout(timer);
    };
  }, [isOpen, data, onChipKeySelect]);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setIsOpen(true)}>
        Open photo map
      </Button>

      {isOpen && (
        <ChildWindow.Modal onClose={setIsOpen}>
          <ChildWindow
            iframeElementRef={iframeRef}
            title="Photo map"
            winRole="photo map"
            pageUrl="/photos-on-map"
            onOpenStateChange={setIsOpen}
          />
        </ChildWindow.Modal>
      )}
    </>
  );
});

export const LoadLatlngSyncMap = memo(
  ({
    controls,
    latlngReader,
  }: {
    latlngReader: (mouse: THREE.Vector2) => LatLng;
    controls: THREE.Controls;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
      const domElement = controls.domElement;

      const click = (event) => {
        const clientWidth = domElement.clientWidth;
        const clientHeight = domElement.clientHeight;

        const mouse = new THREE.Vector2();
        const u = event.offsetX / clientWidth;
        const t = 1 - event.offsetY / clientHeight;

        mouse.set(-1 + 2 * u, -1 + 2 * t);
        const latlng = latlngReader(mouse);
        const locate = iframeRef.current?.contentWindow['__setLatlng__'];
        if (!locate) return;
        locate(latlng.lat, latlng.lng);
      };

      domElement.addEventListener('click', click);

      return () => {
        domElement.removeEventListener('click', click);
      };
    }, [controls, latlngReader]);

    return (
      <>
        <Tooltip label="Open photo map">
          <button className=" rounded-full bg-jade-100 p-2" onClick={() => setIsOpen(true)}>
            <MapIcon />
          </button>
        </Tooltip>
        {isOpen && (
          <div className=" fixed left-4 top-4 w-96 h-96">
            <ChildWindow
              iframeElementRef={iframeRef}
              title="Photo map"
              winRole="photo map"
              pageUrl="/static-leaflet-map?zoom=14"
              onOpenStateChange={setIsOpen}
            />
          </div>
        )}
      </>
    );
  },
);

const MapIcon = () => {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3.5 6.5 5.5-2.5 6 2.5 5.5-2.5v11L15 17.5 9 15l-5.5 2.5z" />
      <path d="M9 4v11m6-8.5v11" />
      <path
        d="M12 13.5s3.5-3.25 3.5-5.75a3.5 3.5 0 1 0-7 0c0 2.5 3.5 5.75 3.5 5.75Z"
        fill="var(--jade-panel)"
      />
      <circle cx="12" cy="7.75" r="1.1" />
    </svg>
  );
};
