import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PhotoRecord } from '@/photos/types';
import { Tooltip } from '@/_components/Tooltip';
import { getPhotoUrl } from './_fns';
import { PhotoTimeline } from './PhotoTimeline';
import { buildPhotoDaylight } from './_photoDaylight';

const ITEM_STRIDE = 104;
const MAX_VISIBLE_ITEMS = 10;
const MAX_MOUNTED_ITEMS = 12;
const GLOW_BLUR_RADIUS = 52;
const GLOW_SPREAD_RADIUS = 12;
const GLOW_OVERSCAN_ITEMS = Math.ceil(
  (GLOW_BLUR_RADIUS * 2 + GLOW_SPREAD_RADIUS) / ITEM_STRIDE,
);

interface PhotoFilmstripProps {
  photos: PhotoRecord[];
  activeIndex: number;
  onSelect: (photo: PhotoRecord) => void;
}

export const PhotoFilmstrip = memo(function PhotoFilmstrip({
  photos,
  activeIndex,
  onSelect,
}: PhotoFilmstripProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState(() => {
    const start = Math.max(0, activeIndex - 1);
    return { start, end: Math.min(photos.length, start + MAX_MOUNTED_ITEMS) };
  });
  const rangeRef = useRef(range);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const daylight = useMemo(() => buildPhotoDaylight(photos), [photos]);
  const glowStart = Math.max(0, range.start - GLOW_OVERSCAN_ITEMS);
  const glowEnd = Math.min(photos.length, range.end + GLOW_OVERSCAN_ITEMS);

  const updateRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const width = Math.min(el.clientWidth, MAX_VISIBLE_ITEMS * ITEM_STRIDE);
    const left = Math.max(0, Math.min(el.scrollLeft, photos.length * ITEM_STRIDE - width));
    // Measure thumbnail bounds, excluding the virtualization overscan and item gaps.
    const visibleStart = Math.min(
      photos.length,
      Math.max(0, Math.floor((left - 100) / ITEM_STRIDE) + 1),
    );
    const visibleEnd =
      width > 0
        ? Math.min(
            photos.length,
            Math.max(visibleStart, Math.ceil((left + width - 4) / ITEM_STRIDE)),
          )
        : visibleStart;
    setVisibleRange((previous) =>
      previous.start === visibleStart && previous.end === visibleEnd
        ? previous
        : { start: visibleStart, end: visibleEnd },
    );
    const start = Math.max(0, Math.floor(left / ITEM_STRIDE) - 1);
    // At fractional scroll positions, prioritize visible items over right overscan.
    const end = Math.min(
      photos.length,
      Math.ceil((left + width) / ITEM_STRIDE) + 1,
      start + MAX_MOUNTED_ITEMS,
    );
    if (rangeRef.current.start !== start || rangeRef.current.end !== end) {
      rangeRef.current = { start, end };
      setRange(rangeRef.current);
    }
  }, [photos.length]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateRange();
    const observer = new ResizeObserver(updateRange);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateRange]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (activeIndex >= 0 && activeIndex < photos.length) {
      const left = activeIndex * ITEM_STRIDE;
      const right = left + ITEM_STRIDE;
      if (left < el.scrollLeft) {
        el.scrollLeft = left;
      } else if (right > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = right - el.clientWidth;
      }
    }
    updateRange();
  }, [activeIndex, photos, updateRange]);

  return (
    <div className="shrink-0 border-t border-white/10 bg-stone-900 px-3 py-2">
      <div
        className="relative isolate mx-auto w-full"
        style={{ maxWidth: MAX_VISIBLE_ITEMS * ITEM_STRIDE }}
      >
        <div
          ref={scrollRef}
          role="region"
          aria-label="Photo thumbnails"
          tabIndex={0}
          onScroll={updateRange}
          className="w-full overflow-x-auto"
        >
          <div className="relative h-22" style={{ width: photos.length * ITEM_STRIDE }}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                maskImage: `
                  linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent),
                  linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)
                `,
                maskComposite: 'intersect',
              }}
            >
              {daylight.segments
                .filter((segment) => segment.end > glowStart && segment.start < glowEnd)
                .map((segment) => {
                  const start = Math.max(segment.start, glowStart);
                  const end = Math.min(segment.end, glowEnd);
                  return (
                    <div
                      key={segment.start}
                      className="absolute inset-y-0 overflow-hidden"
                      style={{
                        left: segment.start * ITEM_STRIDE,
                        width: (segment.end - segment.start) * ITEM_STRIDE,
                      }}
                    >
                      {daylight.samples.slice(start, end).map((light, index) => {
                        const photoIndex = start + index;
                        return (
                          <span
                            key={photoIndex}
                            className="absolute top-5 h-10 w-16 rounded-full opacity-45"
                            style={{
                              left: (photoIndex - segment.start) * ITEM_STRIDE +
                                (ITEM_STRIDE - 64) / 2,
                              backgroundColor: light.color,
                              boxShadow: `0 0 ${GLOW_BLUR_RADIUS}px ${GLOW_SPREAD_RADIUS}px ${light.color}`,
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
            </div>

            {photos.slice(range.start, range.end).map((photo, index) => {
              const photoIndex = range.start + index;
              const fileName = photo.filePath.split('/').pop() ?? photo.filePath;
              const light = daylight.samples[photoIndex];
              const captureTime = photo.takenAt ? Date.parse(photo.takenAt) : NaN;
              const captureLabel = Number.isFinite(captureTime)
                ? new Date(captureTime).toLocaleString()
                : 'Time unavailable';
              return (
                <Tooltip
                  key={photo.id}
                  side="top"
                  className="max-w-[min(20rem,calc(100vw-2rem))] whitespace-normal break-words"
                  label={
                    <div className="space-y-1">
                      <p className="font-semibold">{fileName}</p>
                      <p>{captureLabel}</p>
                      <p className="font-normal">{light.label}</p>
                    </div>
                  }
                >
                  <button
                    type="button"
                    aria-label={`View ${fileName} (${photoIndex + 1} of ${photos.length})`}
                    aria-pressed={photoIndex === activeIndex}
                    onClick={() => onSelect(photo)}
                    className={`absolute top-1 z-10 h-16 w-24 overflow-hidden rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                      photoIndex === activeIndex
                        ? 'border-jade-river-100 border-2'
                        : 'border-white/20 hover:border-2 hover:border-white/60'
                    }`}
                    style={{ left: photoIndex * ITEM_STRIDE + 4 }}
                  >
                    <img
                      src={getPhotoUrl('thumb', photo.filePath)}
                      alt={fileName}
                      draggable={false}
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-1 w-8"
          style={{
            backgroundImage: 'linear-gradient(to right, var(--color-stone-900), transparent)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-1 w-8"
          style={{
            backgroundImage: 'linear-gradient(to left, var(--color-stone-900), transparent)',
          }}
        />
      </div>
      <div className="mx-auto w-full" style={{ maxWidth: MAX_VISIBLE_ITEMS * ITEM_STRIDE }}>
        <PhotoTimeline
          photos={photos}
          activeIndex={activeIndex}
          visibleStart={visibleRange.start}
          visibleEnd={visibleRange.end}
        />
      </div>
    </div>
  );
});
