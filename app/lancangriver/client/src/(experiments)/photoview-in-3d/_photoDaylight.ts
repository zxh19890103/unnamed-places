import { getPosition } from 'suncalc';
import type { PhotoRecord } from '@/photos/types';

const NEUTRAL_COLOR = '#292524';
const MAX_BLEND_GAP_MS = 6 * 60 * 60 * 1000;
const ZONED_CAPTURE_TIME = /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const PALETTE = [
  { altitude: -18, morning: [8, 13, 30], evening: [8, 13, 30], label: 'Night' },
  { altitude: -12, morning: [35, 29, 65], evening: [43, 26, 57], label: 'Deep twilight' },
  { altitude: -6, morning: [95, 68, 125], evening: [119, 57, 91], label: 'Twilight' },
  { altitude: -2, morning: [174, 106, 137], evening: [189, 80, 85], label: 'Dawn / dusk' },
  { altitude: 2, morning: [228, 154, 125], evening: [226, 117, 81], label: 'Sunrise / sunset' },
  { altitude: 6, morning: [235, 181, 139], evening: [231, 150, 77], label: 'Golden hour' },
  { altitude: 12, morning: [238, 199, 157], evening: [234, 176, 94], label: 'Low daylight' },
  { altitude: 25, morning: [242, 219, 180], evening: [240, 200, 131], label: 'Daylight' },
  { altitude: 45, morning: [250, 235, 204], evening: [249, 226, 181], label: 'Bright daylight' },
  { altitude: 65, morning: [255, 247, 223], evening: [255, 247, 223], label: 'High sun' },
  { altitude: 90, morning: [255, 252, 240], evening: [255, 252, 240], label: 'High sun' },
];

type DaylightSample = {
  color: string;
  time: number | null;
  label: string;
  unavailable: boolean;
};

export function captureTime(photo: PhotoRecord): number | null {
  if (!photo.takenAt || !ZONED_CAPTURE_TIME.test(photo.takenAt)) return null;
  const time = Date.parse(photo.takenAt);
  return Number.isFinite(time) ? time : null;
}

function sampleDaylight(photo: PhotoRecord): DaylightSample {
  const unavailable = (reason: string): DaylightSample => ({
    color: NEUTRAL_COLOR,
    time: null,
    label: `Daylight unavailable: ${reason}`,
    unavailable: true,
  });
  if (!photo.takenAt) return unavailable('missing capture time');
  // Never let Date.parse interpret an unzoned camera clock in the browser's timezone.
  if (!ZONED_CAPTURE_TIME.test(photo.takenAt)) {
    return unavailable('capture time needs an explicit timezone');
  }
  const time = captureTime(photo);
  if (time === null) return unavailable('invalid capture time');
  if (
    !Number.isFinite(photo.lat) || Math.abs(photo.lat) > 90 ||
    !Number.isFinite(photo.lng) || Math.abs(photo.lng) > 180
  ) {
    return unavailable('invalid coordinates');
  }
  const { altitude, azimuth } = getPosition(new Date(time), photo.lat, photo.lng);
  if (!Number.isFinite(altitude) || !Number.isFinite(azimuth)) {
    return unavailable('invalid solar position');
  }
  const upperIndex = PALETTE.findIndex((entry) => altitude <= entry.altitude);
  const upper = PALETTE[upperIndex < 0 ? PALETTE.length - 1 : upperIndex];
  const lower = PALETTE[Math.max(0, upperIndex < 0 ? PALETTE.length - 1 : upperIndex - 1)];
  const fraction = upper === lower
    ? 0
    : (altitude - lower.altitude) / (upper.altitude - lower.altitude);
  // SunCalc 2 uses clockwise degrees from north: east is morning, west is evening.
  // A continuous weight avoids a color jump when the sun crosses solar noon.
  const eveningWeight = (1 - Math.sin(azimuth * Math.PI / 180)) / 2;
  const rgb = lower.morning.map((channel, index) => {
    const morning = channel + (upper.morning[index] - channel) * fraction;
    const evening = lower.evening[index] +
      (upper.evening[index] - lower.evening[index]) * fraction;
    return Math.round(morning + (evening - morning) * eveningWeight);
  });
  const phase = altitude > -18 ? (eveningWeight < 0.5 ? 'Morning' : 'Evening') : 'Night';
  return {
    color: `rgb(${rgb.join(', ')})`,
    time,
    label: `${phase}: ${upper.label} (sun ${altitude.toFixed(1)} degrees above horizon)`,
    unavailable: false,
  };
}

export function buildPhotoDaylight(photos: PhotoRecord[]) {
  const samples = photos.map(sampleDaylight);
  const segments: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index];
    const previous = samples[index - 1];
    const gap = sample.time !== null && previous.time !== null
      ? Math.abs(sample.time - previous.time)
      : null;
    const dateChanged = gap !== null &&
      photos[index].takenAt?.slice(0, 10) !== photos[index - 1].takenAt?.slice(0, 10);
    const timeBreak = gap !== null && (gap > MAX_BLEND_GAP_MS || dateChanged);
    if (timeBreak || sample.unavailable || previous.unavailable) {
      segments.push({ start, end: index });
      start = index;
    }
  }
  if (samples.length > 0) segments.push({ start, end: samples.length });
  return {
    samples,
    segments,
  };
}
