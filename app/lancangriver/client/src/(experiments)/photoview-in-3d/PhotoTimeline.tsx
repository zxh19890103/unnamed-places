import { memo, useMemo } from 'react';
import type { PhotoRecord } from '@/photos/types';
import { Tooltip } from '@/_components/Tooltip';
import { buildCalendarRuler, buildPhotoDays, localPhotoDay, photoDisplayTime } from './_photoTime';

interface PhotoTimelineProps {
  photos: PhotoRecord[];
  activeIndex: number;
  visibleStart: number;
  visibleEnd: number;
  onDayClick: (firstPhotoIndex: number) => void;
}

const DENSITY_BUCKET_COUNT = 64;

function timeSpan(times: Array<number | null>): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const time of times) {
    if (time === null) continue;
    start = Math.min(start, time);
    end = Math.max(end, time);
  }
  return start === Infinity ? null : { start, end };
}

export const PhotoTimeline = memo(function PhotoTimeline({
  photos,
  activeIndex,
  visibleStart,
  visibleEnd,
  onDayClick,
}: PhotoTimelineProps) {
  const timestamps = useMemo(
    () => photos.map(photoDisplayTime),
    [photos],
  );
  const days = useMemo(() => buildPhotoDays(timestamps), [timestamps]);
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    [],
  );
  const fullSpan = useMemo(() => timeSpan(timestamps), [timestamps]);
  const calendar = useMemo(() => buildCalendarRuler(days, fullSpan), [days, fullSpan]);
  const calendarFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    [],
  );
  const density = useMemo(() => {
    if (!fullSpan) return null;
    const duration = fullSpan.end - fullSpan.start;
    const counts = Array<number>(DENSITY_BUCKET_COUNT).fill(0);
    for (const time of timestamps) {
      if (time === null) continue;
      const index =
        duration > 0
          ? Math.min(
              DENSITY_BUCKET_COUNT - 1,
              Math.floor(((time - fullSpan.start) / duration) * DENSITY_BUCKET_COUNT),
            )
          : Math.floor(DENSITY_BUCKET_COUNT / 2);
      counts[index] += 1;
    }
    const peak = Math.max(...counts);
    const stops = counts.map((count, index) => {
      const intensity = Math.log1p(count) / Math.log1p(peak);
      const lightness = count === 0 ? 13 : 24 + intensity * 52;
      const color = `hsl(160 45% ${lightness}%)`;
      return `${color} ${((index + 0.5) / DENSITY_BUCKET_COUNT) * 100}%`;
    });
    return { background: `linear-gradient(to right, ${stops.join(', ')})`, peak };
  }, [timestamps, fullSpan]);
  const visibleTimes = timestamps.slice(visibleStart, visibleEnd);
  const visibleSpan = timeSpan(visibleTimes);
  const missingCount = visibleTimes.filter((time) => time === null).length;
  const multiDay = fullSpan
    ? new Date(fullSpan.start).toDateString() !== new Date(fullSpan.end).toDateString()
    : false;
  const tickFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        ...(multiDay ? ({ month: 'short', day: 'numeric' } as const) : {}),
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [multiDay],
  );
  const rangeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [],
  );
  const duration = fullSpan ? fullSpan.end - fullSpan.start : 0;
  const selectedTime = timestamps[activeIndex] ?? null;
  const selectedDay = selectedTime !== null ? localPhotoDay(selectedTime) : null;
  const selectedLabel =
    selectedTime !== null ? rangeFormatter.format(selectedTime) : 'Time unavailable';
  const selectedPosition =
    fullSpan && selectedTime !== null && duration > 0
      ? ((selectedTime - fullSpan.start) / duration) * 100
      : 50;
  const left =
    fullSpan && visibleSpan && duration > 0
      ? ((visibleSpan.start - fullSpan.start) / duration) * 100
      : 50;
  const width =
    visibleSpan && duration > 0 ? ((visibleSpan.end - visibleSpan.start) / duration) * 100 : 0;
  const visibleLabel = visibleSpan
    ? `${rangeFormatter.format(visibleSpan.start)}${
        visibleSpan.end !== visibleSpan.start
          ? ` - ${multiDay ? rangeFormatter.format(visibleSpan.end) : tickFormatter.format(visibleSpan.end)}`
          : ''
      }`
    : 'Time unavailable';

  return (
    <div
      role="group"
      aria-label="Photo capture timeline"
      className="space-y-1.5 pt-1 pb-1 text-[10px] text-white/50"
    >
      <p className="text-center text-white/70">
        Visible: {visibleLabel}
        {missingCount > 0 && visibleSpan && (
          <span className="text-white/50"> ({missingCount} with time unavailable)</span>
        )}
      </p>
      <div
        role="img"
        aria-label={
          density
            ? `Photo density over the full capture range. Brighter jade means more photos. Peak: ${density.peak} photos per time bucket. Visible range: ${visibleLabel}. Selected photo: ${selectedLabel}.`
            : 'Photo density unavailable: no valid capture times.'
        }
        className="relative h-2 rounded-full bg-white/15"
        style={density ? { background: density.background } : undefined}
        title={
          fullSpan
            ? `Full capture range: ${rangeFormatter.format(fullSpan.start)} - ${rangeFormatter.format(fullSpan.end)}`
            : 'Time unavailable'
        }
      >
        {fullSpan && selectedTime !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-2.5 z-10 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-amber-300"
            style={{ left: `${selectedPosition}%` }}
          />
        )}
        {fullSpan && visibleSpan && (
          <div
            className="absolute -inset-y-0.5 rounded-full border border-white shadow-[0_0_0_1px_#0008]"
            style={{
              width: `max(6px, ${width}%)`,
              left: `clamp(0px, calc(${left}% - ${width === 0 ? 3 : 0}px), calc(100% - max(6px, ${width}%)))`,
            }}
          />
        )}
      </div>
      {fullSpan ? (
        <div role="group" aria-label="Capture day calendar ruler" className="relative h-9 w-full">
          {calendar.map((segment) => {
            const { day } = segment;
            const visible = day?.photoIndices.some(
              (index) => index >= visibleStart && index < visibleEnd,
            ) ?? false;
            const selected = segment.key === selectedDay;
            const label = dayFormatter.format(segment.time);
            const style = { left: `${segment.left}%`, width: `${segment.width}%` };
            const segmentClassName = 'absolute inset-y-0 flex min-w-0 flex-col items-stretch justify-start overflow-hidden p-0 pt-1 text-[10px] leading-normal';
            const contents = (
              <>
                <span aria-hidden="true" className="relative block h-1.5 w-full shrink-0 border-x border-current">
                  <span className={`absolute inset-x-0 top-0 border-t border-current ${day ? 'border-solid' : 'border-dashed'}`} />
                </span>
                <span className="mt-1 flex min-w-0 items-center justify-center gap-1 overflow-hidden">
                  {selected && (
                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                  )}
                  <span className="truncate">{calendarFormatter.format(segment.time)}</span>
                </span>
              </>
            );
            if (!day) {
              return (
                <div
                  key={segment.key}
                  aria-label={`${label}: no photos`}
                  className={`${segmentClassName} text-white/20`}
                  style={style}
                >
                  {contents}
                </div>
              );
            }
            const count = `${day.photoIndices.length} ${day.photoIndices.length === 1 ? 'photo' : 'photos'}`;
            return (
              <Tooltip
                key={segment.key}
                label={`Scroll to first photo of ${label}. ${count}. Selection stays unchanged.`}
              >
                <button
                  type="button"
                  onClick={() => onDayClick(day.firstIndex)}
                  aria-label={`Scroll to ${label}, ${count}${visible ? ', visible in filmstrip' : ''}${selected ? ', selected photo day' : ''}`}
                  aria-current={selected ? 'date' : undefined}
                  className={`${segmentClassName} cursor-pointer appearance-none bg-transparent transition-colors hover:text-jade-river-300 focus-visible:text-jade-river-300 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-jade-river-300 ${
                    visible ? 'text-jade-river-300' : 'text-white/50'
                  }`}
                  style={style}
                >
                  {contents}
                </button>
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <p className="text-center">No valid capture times in this chip.</p>
      )}
    </div>
  );
});
