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

export function buildCalendarRuler(
  days: PhotoDay[],
  span: { start: number; end: number } | null,
): Array<{ key: string; time: number; left: number; width: number; day?: PhotoDay }> {
  if (!span) return [];
  const duration = span.end - span.start;
  const populated = new Map(days.map((day) => [day.key, day]));
  const segments: Array<{ key: string; time: number; left: number; width: number; day?: PhotoDay }> = [];
  const midnight = new Date(span.start);
  midnight.setHours(0, 0, 0, 0);
  while (midnight.getTime() <= span.end) {
    const start = midnight.getTime();
    const key = localPhotoDay(start);
    // Advance by calendar date, not 24 hours: local days can be 23 or 25 hours.
    midnight.setDate(midnight.getDate() + 1);
    const end = midnight.getTime();
    segments.push({
      key,
      time: start,
      left: duration > 0 ? (Math.max(start, span.start) - span.start) / duration * 100 : 0,
      width: duration > 0
        ? (Math.min(end, span.end) - Math.max(start, span.start)) / duration * 100
        : 100,
      day: populated.get(key),
    });
  }
  return segments;
}
