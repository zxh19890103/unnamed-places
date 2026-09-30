import type {
  JourneyBuildResult,
  JourneyChipNode,
  JourneyDayNode,
  JourneyGeoNode,
  PhotoRecord,
} from './types';

function toDayKey(takenAt: string | null): string {
  if (!takenAt) {
    return 'unknown-date';
  }

  const date = new Date(takenAt);
  if (Number.isNaN(date.getTime())) {
    return 'unknown-date';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDisplayLabel(dayKey: string): string {
  return dayKey === 'unknown-date' ? 'Unknown Date' : dayKey;
}

function toPlaceChip(lat: number, lng: number): string {
  return `${lat.toFixed(1)}, ${lng.toFixed(1)}`;
}

export function buildJourneyDays(records: PhotoRecord[]): JourneyBuildResult {
  const buckets = new Map<string, PhotoRecord[]>();
  const geoBuckets = new Map<string, PhotoRecord[]>();
  let skippedInvalidCoordinateCount = 0;

  for (const record of records) {
    if (!Number.isFinite(record.lat) || !Number.isFinite(record.lng)) {
      skippedInvalidCoordinateCount += 1;
      continue;
    }

    const dayKey = toDayKey(record.takenAt);
    const dayBucket = buckets.get(dayKey) ?? [];
    dayBucket.push(record);
    buckets.set(dayKey, dayBucket);

    const chipKey = toPlaceChip(record.lat, record.lng);
    const geoBucket = geoBuckets.get(chipKey) ?? [];
    geoBucket.push(record);
    geoBuckets.set(chipKey, geoBucket);
  }

  const days: JourneyDayNode[] = [...buckets.entries()].map(([dayKey, bucket]) => {
    const photoCount = bucket.length;
    const representativeLat = bucket.reduce((sum, item) => sum + item.lat, 0) / photoCount;
    const representativeLng = bucket.reduce((sum, item) => sum + item.lng, 0) / photoCount;
    const placeChips = [...new Set(bucket.map((item) => toPlaceChip(item.lat, item.lng)))];

    return {
      dayKey,
      displayLabel: toDisplayLabel(dayKey),
      photoCount,
      representativeLat,
      representativeLng,
      placeChips,
      photoIds: bucket.map((item) => item.id),
      photos: bucket,
    };
  });

  days.sort((left, right) => {
    if (left.dayKey === 'unknown-date') {
      return 1;
    }
    if (right.dayKey === 'unknown-date') {
      return -1;
    }

    return right.dayKey.localeCompare(left.dayKey);
  });

  const geoNodes: JourneyGeoNode[] = [...geoBuckets.entries()]
    .map(([chipKey, bucket]) => {
      const photoCount = bucket.length;

      const representativeLat = bucket.reduce((sum, item) => sum + item.lat, 0) / photoCount;
      const representativeLng = bucket.reduce((sum, item) => sum + item.lng, 0) / photoCount;

      const byDateMap = new Map<string, PhotoRecord[]>();
      for (const photo of bucket) {
        const dayKey = toDayKey(photo.takenAt);
        const existing = byDateMap.get(dayKey) ?? [];
        existing.push(photo);
        byDateMap.set(dayKey, existing);
      }

      const bydate = [...byDateMap.entries()]
        .map(([key, photos]) => ({
          key,
          date: photos[0]?.takenAt ? new Date(photos[0].takenAt) : new Date(0),
          photos,
        }))
        .sort((left, right) => right.date.getTime() - left.date.getTime());

      return {
        chipKey,
        displayLabel: chipKey,
        photoCount,
        representativeLat,
        representativeLng,
        photoIds: bucket.map((item) => item.id),
        photos: bucket,
        bydate,
      };
    })
    .sort((left, right) => right.photoCount - left.photoCount);

  const chipNodes: JourneyChipNode[] = days.flatMap((day) => {
    const chipBuckets = new Map<string, PhotoRecord[]>();

    for (const photo of day.photos) {
      const chipKey = toPlaceChip(photo.lat, photo.lng);
      const bucket = chipBuckets.get(chipKey) ?? [];
      bucket.push(photo);
      chipBuckets.set(chipKey, bucket);
    }

    return [...chipBuckets.entries()].map(([chipKey, bucket]) => ({
      chipKey,
      photos: bucket,
    }));
  });

  return {
    days,
    geoNodes,
    chipNodes,
    records,
    buckets,
    geoBuckets,
    skippedInvalidCoordinateCount,
  };
}
