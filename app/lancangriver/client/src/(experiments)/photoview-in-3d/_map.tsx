import * as THREE from 'three';
import { memo, useEffect, useRef, useState } from 'react';
import { ChildWindow } from '@/_components/Window';
import { Button } from '@/_components/Button';
import type { JourneyBuildResult } from '@/photos/types';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
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
    controls: OrbitControls;
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
        console.log(latlng, iframeRef.current);
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
        <button
          onClick={() => {
            setIsOpen(true);
          }}
        >
          Map
        </button>
        {isOpen && (
          <div className=" fixed left-4 top-4 w-96 h-96">
            <ChildWindow
              iframeElementRef={iframeRef}
              title="Photo map"
              winRole="photo map"
              pageUrl="/static-leaflet-map"
              onOpenStateChange={setIsOpen}
            />
          </div>
        )}
      </>
    );
  },
);
