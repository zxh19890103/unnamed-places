import { useMemo } from 'react';
import { Cross1Icon } from '@radix-ui/react-icons';
import type { PhotoRecord } from '@/photos/types';
import { Tooltip } from '@/_components/Tooltip';
import type { BBox } from '../_tile';
import { buildPhotoDaylight } from '../_photoDaylight';
import { JourneyMap } from './JourneyMap';
import { buildJourneyMoments } from './_journey';

interface PhotoJourneyPanelProps {
  photos: PhotoRecord[];
  activePhoto: PhotoRecord;
  osmBbox: BBox | null;
  onSelect: (photo: PhotoRecord) => void;
  onClose: () => void;
}

export function PhotoJourneyPanel({
  photos,
  activePhoto,
  osmBbox,
  onSelect,
  onClose,
}: PhotoJourneyPanelProps) {
  const moments = useMemo(() => buildJourneyMoments(photos), [photos]);
  const daylight = useMemo(() => buildPhotoDaylight(photos).samples, [photos]);
  const colors = useMemo(
    () => new Map(photos.map((photo, index) => [photo.id, daylight[index].color])),
    [photos, daylight],
  );
  const activeIndex = moments.findIndex((moment) =>
    moment.photos.some((photo) => photo.id === activePhoto.id),
  );

  return (
    <aside
      id="photo-journey-panel"
      data-photo-map
      aria-label="Photo journey"
      className="flex w-170 shrink-0 flex-col border-r border-white/10 bg-stone-900 text-xs text-white"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 p-3">
        <div>
          <h3 className="font-semibold">Journey</h3>
          <p className="mt-1 text-[10px] text-white/50">
            {moments.length} moments · Time and place together
          </p>
        </div>
        <Tooltip label="Close journey">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close journey"
            className="cursor-pointer rounded p-2 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Cross1Icon />
          </button>
        </Tooltip>
      </header>
      <JourneyMap
        moments={moments}
        activeIndex={activeIndex}
        activePhoto={activePhoto}
        colors={colors}
        osmBbox={osmBbox}
        onSelect={onSelect}
      />
    </aside>
  );
}
