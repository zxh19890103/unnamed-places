import React, { useState } from 'react';
import { ChildWindow } from '@/_components/Window';
import { Button } from '@/_components/Button';
import type { PhotoviewViewer } from './_viewer';
import { AButton } from '@/_components';

type Props = {
  viewer?: PhotoviewViewer | null;
};

export const OsmJobsCreate = ({ viewer }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  const getPageUrl = () => {
    const bbox = viewer?.tileGrid?.bbox;
    if (bbox && typeof bbox.west === 'number') {
      const { west, south, east, north } = bbox;
      return `/jobs-create?bbox=${west},${south},${east},${north}`;
    }
    return '/jobs-create';
  };

  return (
    <>
      <AButton
        type="button"
        className=""
        onClick={() => setIsOpen(true)}
      >
        Create OSM Job
      </AButton>

      {isOpen && (
        <ChildWindow.Modal onClose={setIsOpen}>
          <ChildWindow
            title="Create OSM Job"
            winRole="OSM Job Creation"
            pageUrl={getPageUrl()}
            onOpenStateChange={setIsOpen}
          />
        </ChildWindow.Modal>
      )}
    </>
  );
};
