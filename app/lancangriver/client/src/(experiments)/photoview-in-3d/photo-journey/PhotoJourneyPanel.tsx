import { useMemo } from 'react';
import { Cross1Icon } from '@radix-ui/react-icons';
import type { PhotoRecord } from '@/photos/types';
import { Tooltip } from '@/_components/Tooltip';
import type { BBox } from '../_tile';
import { buildPhotoDaylight } from '../_photoDaylight';
import { getPhotoUrl } from '../_fns';
import { JourneyMap } from './JourneyMap';
import { buildJourneyMoments, formatCaptureTime, hasSequenceLink, relationLabel } from './_journey';

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
  const moment = moments[activeIndex];
  const neighbors = [
    { label: 'Previous moment', moment: moments[activeIndex - 1], before: true },
    { label: 'Next moment', moment: moments[activeIndex + 1], before: false },
  ];
  const light = daylight[photos.findIndex((photo) => photo.id === activePhoto.id)];

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
      <section className="max-h-[45%] shrink-0 space-y-3 overflow-y-auto border-t border-white/10 p-3">
        <div className="border-l-2 pl-3" style={{ borderColor: colors.get(activePhoto.id) }}>
          <p className="text-[10px] uppercase tracking-wider text-amber-200">
            Selected moment {activeIndex >= 0 ? activeIndex + 1 : ''}
          </p>
          <p className="mt-1 font-semibold">{formatCaptureTime(activePhoto)}</p>
          <p className="mt-1 text-[10px] text-white/60">{light?.label}</p>
          <p className="mt-1 text-[10px] text-white/50">
            Local display time · Distances are straight-line
          </p>
        </div>
        {moment && moment.photos.length > 1 && (
          <div>
            <p className="mb-2 text-white/60">
              {moment.photos.length} photos at this place · {formatCaptureTime(moment.photos[0])}
              {' — '}
              {formatCaptureTime(moment.photos[moment.photos.length - 1])}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Photos in this moment">
              {moment.photos.map((photo) => (
                <Tooltip key={photo.id} label={formatCaptureTime(photo)}>
                  <button
                    type="button"
                    onClick={() => onSelect(photo)}
                    aria-label={`View ${photo.filePath.split('/').pop()}`}
                    aria-pressed={photo.id === activePhoto.id}
                    className={`h-12 w-16 shrink-0 cursor-pointer overflow-hidden rounded border-2 ${
                      photo.id === activePhoto.id ? 'border-amber-300' : 'border-white/20'
                    }`}
                  >
                    <img
                      src={getPhotoUrl('thumb', photo.filePath)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
        {neighbors.map(({ label, moment: neighbor, before }) => {
          if (!neighbor || !moment) return null;
          const photo = neighbor.photos[before ? neighbor.photos.length - 1 : 0];
          const linked = before
            ? hasSequenceLink(neighbor, moment)
            : hasSequenceLink(moment, neighbor);
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(photo)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10"
            >
              <img
                src={getPhotoUrl('thumb', photo.filePath)}
                alt=""
                className="h-10 w-14 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 space-y-1">
                <span className="block text-[10px] text-white/50">{label}</span>
                <span className="block">{relationLabel(activePhoto, photo)}</span>
                <span className="block text-[10px] text-white/60">{formatCaptureTime(photo)}</span>
                {!linked && (
                  <span className="block text-[10px] text-amber-200">
                    Sequence break: date/time gap or unavailable metadata
                  </span>
                )}
              </span>
            </button>
          );
        })}
        <p className="text-[10px] text-white/50">
          Moments are chronological; untimed photos appear last without links. Same-place bursts
          group within 15 m and 30 min between shots.
        </p>
      </section>
    </aside>
  );
}
