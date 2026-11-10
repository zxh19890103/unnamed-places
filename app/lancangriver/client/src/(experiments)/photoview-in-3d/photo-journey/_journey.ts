import type { PhotoRecord } from '@/photos/types';
import { hasPhotoLocation } from '../_photoMap';
import { captureTime } from '../_photoDaylight';

export { captureTime } from '../_photoDaylight';

const BURST_GAP_MS = 30 * 60 * 1000;
const SEQUENCE_GAP_MS = 6 * 60 * 60 * 1000;
const SAME_PLACE_METERS = 15;

export type JourneyMoment = {
  photos: PhotoRecord[];
  time: number | null;
  endTime: number | null;
};

export function distanceMeters(from: PhotoRecord, to: PhotoRecord): number {
  const radians = Math.PI / 180;
  const lat1 = from.lat * radians;
  const lat2 = to.lat * radians;
  const a = Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((to.lng - from.lng) * radians / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function buildJourneyMoments(photos: PhotoRecord[]): JourneyMoment[] {
  const ordered = photos.map((photo, index) => ({ photo, time: captureTime(photo), index }))
    .sort((a, b) => {
      if (a.time === null) return b.time === null ? a.index - b.index : 1;
      if (b.time === null) return -1;
      return a.time - b.time || a.index - b.index;
    });
  const moments: JourneyMoment[] = [];
  for (const { photo, time } of ordered) {
    const previous = moments[moments.length - 1];
    const anchor = previous?.photos[0];
    if (previous && time !== null && previous.endTime !== null &&
      time - previous.endTime <= BURST_GAP_MS && hasPhotoLocation(anchor) &&
      hasPhotoLocation(photo) && distanceMeters(anchor, photo) <= SAME_PLACE_METERS &&
      anchor.takenAt?.slice(0, 10) === photo.takenAt?.slice(0, 10)) {
      previous.photos.push(photo);
      previous.endTime = time;
    } else {
      moments.push({ photos: [photo], time, endTime: time });
    }
  }
  return moments;
}

export function hasSequenceLink(from: JourneyMoment, to: JourneyMoment): boolean {
  const last = from.photos[from.photos.length - 1];
  const first = to.photos[0];
  return from.endTime !== null && to.time !== null &&
    to.time - from.endTime >= 0 && to.time - from.endTime <= SEQUENCE_GAP_MS &&
    last.takenAt?.slice(0, 10) === first.takenAt?.slice(0, 10) &&
    hasPhotoLocation(last) && hasPhotoLocation(first);
}

function elapsedLabel(milliseconds: number): string {
  if (milliseconds < 60000) return `${Math.round(milliseconds / 1000)} sec`;
  if (milliseconds < 3600000) return `${Math.floor(milliseconds / 60000)} min`;
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds % 3600000 / 60000);
  return `${hours} hr${minutes ? ` ${minutes} min` : ''}`;
}

export function relationLabel(from: PhotoRecord, to: PhotoRecord): string {
  const fromTime = captureTime(from);
  const toTime = captureTime(to);
  const delta = fromTime !== null && toTime !== null ? toTime - fromTime : null;
  const time = delta === null ? 'Time unavailable'
    : delta === 0 ? '0 min'
    : `${delta > 0 ? '+' : '−'}${elapsedLabel(Math.abs(delta))}`;
  if (!hasPhotoLocation(from) || !hasPhotoLocation(to)) return `${time} · Location unavailable`;
  const distance = distanceMeters(from, to);
  if (distance <= SAME_PLACE_METERS) return `${time} · Same place`;
  const length = distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`;
  return `${time} · ${length}`;
}

export function momentPhoto(moment: JourneyMoment, activePhoto: PhotoRecord, before: boolean) {
  return moment.photos.find((photo) => photo.id === activePhoto.id)
    ?? moment.photos[before ? moment.photos.length - 1 : 0];
}

export function formatCaptureTime(photo: PhotoRecord): string {
  const time = captureTime(photo);
  return time === null ? 'Time unavailable (missing, invalid, or no timezone)'
    : new Date(time).toLocaleString();
}

export function formatCaptureClockTime(photo: PhotoRecord): string {
  const time = captureTime(photo);
  if (time === null) return formatCaptureTime(photo);
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function journeyThumbnailFilter(activePhoto: PhotoRecord, photo: PhotoRecord): string {
  const activeTime = captureTime(activePhoto);
  const time = captureTime(photo);
  if (activeTime === null || time === null || time === activeTime) return 'saturate(1) blur(0px)';
  const delta = time - activeTime;
  const strength = Math.tanh(Math.abs(delta) / (15 * 60 * 1000));
  const saturation = delta < 0 ? 0.7 - 0.35 * strength : 1.3 + 0.35 * strength;
  return `saturate(${saturation}) blur(${2 * strength}px)`;
}
