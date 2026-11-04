import React, { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { PhotoRecord } from '@/photos/types';
import { getPhotoUrl } from './_fns';

const ITEM_STRIDE = 104;
const MAX_VISIBLE_ITEMS = 10;
const MAX_MOUNTED_ITEMS = 12;

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

  const updateRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const width = Math.min(el.clientWidth, MAX_VISIBLE_ITEMS * ITEM_STRIDE);
    const left = Math.max(0, Math.min(el.scrollLeft, photos.length * ITEM_STRIDE - width));
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
    <div className="shrink-0 border-t border-white/10 bg-jade-depth/60 px-3 py-2">
      <div
        ref={scrollRef}
        role="region"
        aria-label="Photo thumbnails"
        tabIndex={0}
        onScroll={updateRange}
        className="mx-auto w-full overflow-x-auto overscroll-x-contain"
        style={{ maxWidth: MAX_VISIBLE_ITEMS * ITEM_STRIDE }}
      >
        <div className="relative h-20" style={{ width: photos.length * ITEM_STRIDE }}>
          {photos.slice(range.start, range.end).map((photo, index) => {
            const photoIndex = range.start + index;
            const fileName = photo.filePath.split('/').pop() ?? photo.filePath;
            return (
              <button
                key={photo.id}
                type="button"
                aria-label={`View ${fileName} (${photoIndex + 1} of ${photos.length})`}
                aria-pressed={photoIndex === activeIndex}
                title={fileName}
                onClick={() => onSelect(photo)}
                className={`absolute top-1 h-16 w-24 overflow-hidden rounded-md border-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  photoIndex === activeIndex
                    ? 'border-jade-river'
                    : 'border-white/20 hover:border-white/60'
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
            );
          })}
        </div>
      </div>
    </div>
  );
});
