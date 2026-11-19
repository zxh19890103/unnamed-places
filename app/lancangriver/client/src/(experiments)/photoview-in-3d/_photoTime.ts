import type { PhotoRecord } from '@/photos/types';

export function photoDisplayTime(photo: PhotoRecord): number | null {
  const time = photo.takenAt ? Date.parse(photo.takenAt) : NaN;
  return Number.isFinite(time) ? time : null;
}

export function sortPhotosByTime(photos: PhotoRecord[]): PhotoRecord[] {
  return photos.map((photo, index) => ({ photo, index, time: photoDisplayTime(photo) }))
    .sort((a, b) => {
      if (a.time === null) return b.time === null ? a.index - b.index : 1;
      if (b.time === null) return -1;
      return a.time - b.time || a.index - b.index;
    })
    .map(({ photo }) => photo);
}

export function localPhotoDay(time: number): string {
  const date = new Date(time);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export type PhotoDay = {
  key: string;
  time: number;
  firstIndex: number;
  photoIndices: number[];
};

export function buildPhotoDays(timestamps: Array<number | null>): PhotoDay[] {
  const days = new Map<string, PhotoDay>();
  timestamps.forEach((time, index) => {
    if (time === null) return;
    const key = localPhotoDay(time);
    const day = days.get(key);
    if (day) {
      day.photoIndices.push(index);
      if (time < day.time) {
        day.time = time;
        day.firstIndex = index;
      }
    } else {
      days.set(key, { key, time, firstIndex: index, photoIndices: [index] });
    }
  });
  return [...days.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export type CalendarUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type CalendarSegment = {
  key: string;
  time: number;
  end: number;
  left: number;
  width: number;
  firstIndex?: number;
  photoIndices: number[];
};

const MIN_CALENDAR_SLICE_PX = 72;

function periodStart(time: number, unit: CalendarUnit, yearStep: number): Date {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  if (unit === 'week') {
    date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  } else if (unit === 'month' || unit === 'quarter') {
    date.setDate(1);
    if (unit === 'quarter') date.setMonth(Math.floor(date.getMonth() / 3) * 3);
  } else if (unit === 'year') {
    date.setFullYear(Math.floor(date.getFullYear() / yearStep) * yearStep, 0, 1);
  }
  return date;
}

function advancePeriod(date: Date, unit: CalendarUnit, yearStep: number): void {
  // Use calendar arithmetic so local DST transitions retain correct boundaries.
  if (unit === 'day' || unit === 'week') {
    date.setDate(date.getDate() + (unit === 'day' ? 1 : 7));
  } else if (unit === 'month' || unit === 'quarter') {
    date.setMonth(date.getMonth() + (unit === 'month' ? 1 : 3));
  } else {
    date.setFullYear(date.getFullYear() + yearStep);
  }
}

export function buildCalendarRuler(
  days: PhotoDay[],
  span: { start: number; end: number } | null,
  widthPx: number,
): { start: number; end: number; unit: CalendarUnit; segments: CalendarSegment[] } | null {
  if (!span || widthPx <= 0) return null;
  const maxSlices = Math.max(1, Math.floor(widthPx / MIN_CALENDAR_SLICE_PX));
  const candidates: Array<{ unit: CalendarUnit; yearStep: number }> = [
    { unit: 'day', yearStep: 1 },
    { unit: 'week', yearStep: 1 },
    { unit: 'month', yearStep: 1 },
    { unit: 'quarter', yearStep: 1 },
  ];
  const years = new Date(span.end).getFullYear() - new Date(span.start).getFullYear() + 1;
  for (let magnitude = 1; magnitude <= years * 10; magnitude *= 10) {
    for (const multiplier of [1, 2, 5]) {
      candidates.push({ unit: 'year', yearStep: magnitude * multiplier });
    }
  }
  for (const { unit, yearStep } of candidates) {
    const cursor = periodStart(span.start, unit, yearStep);
    const start = cursor.getTime();
    const boundaries: Array<{ time: number; end: number }> = [];
    while (cursor.getTime() <= span.end && boundaries.length <= maxSlices) {
      const time = cursor.getTime();
      advancePeriod(cursor, unit, yearStep);
      boundaries.push({ time, end: cursor.getTime() });
    }
    if (boundaries.length > maxSlices) continue;
    const end = cursor.getTime();
    const duration = end - start;
    if (boundaries.length > 1 && boundaries.some(
      (period) => (period.end - period.time) / duration * widthPx < MIN_CALENDAR_SLICE_PX,
    )) continue;

    let dayIndex = 0;
    const segments = boundaries.map(({ time, end: periodEnd }): CalendarSegment => {
      const photoIndices: number[] = [];
      let firstIndex: number | undefined;
      while (dayIndex < days.length && days[dayIndex].time < periodEnd) {
        const day = days[dayIndex++];
        if (firstIndex === undefined) firstIndex = day.firstIndex;
        for (const index of day.photoIndices) photoIndices.push(index);
      }
      return {
        key: localPhotoDay(time),
        time,
        end: periodEnd,
        left: (time - start) / duration * 100,
        width: (periodEnd - time) / duration * 100,
        firstIndex,
        photoIndices,
      };
    });
    return { start, end, unit, segments };
  }
  throw new Error('Unable to build a calendar ruler for the capture range.');
}
