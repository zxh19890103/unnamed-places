import type { JourneyBuildResult, JourneyDayNode, PhotoRecord } from "./types";

function toDayKey(takenAt: string | null): string {
  if (!takenAt) {
    return "unknown-date";
  }

  const date = new Date(takenAt);
  if (Number.isNaN(date.getTime())) {
    return "unknown-date";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDisplayLabel(dayKey: string): string {
  return dayKey === "unknown-date" ? "Unknown Date" : dayKey;
}

function toPlaceChip(lat: number, lng: number): string {
  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

export function buildJourneyDays(records: PhotoRecord[]): JourneyBuildResult {
  const buckets = new Map<string, PhotoRecord[]>();
  let skippedInvalidCoordinateCount = 0;

  for (const record of records) {
    if (!Number.isFinite(record.lat) || !Number.isFinite(record.lng)) {
      skippedInvalidCoordinateCount += 1;
      continue;
    }

    const dayKey = toDayKey(record.takenAt);
    const bucket = buckets.get(dayKey) ?? [];
    bucket.push(record);
    buckets.set(dayKey, bucket);
  }

  const days: JourneyDayNode[] = [...buckets.entries()].map(
    ([dayKey, bucket]) => {
      const photoCount = bucket.length;
      const representativeLat =
        bucket.reduce((sum, item) => sum + item.lat, 0) / photoCount;
      const representativeLng =
        bucket.reduce((sum, item) => sum + item.lng, 0) / photoCount;
      const placeChips = [
        ...new Set(bucket.map((item) => toPlaceChip(item.lat, item.lng))),
      ];

      return {
        dayKey,
        displayLabel: toDisplayLabel(dayKey),
        photoCount,
        representativeLat,
        representativeLng,
        placeChips,
        photoIds: bucket.map((item) => item.id),
      };
    },
  );

  days.sort((left, right) => {
    if (left.dayKey === "unknown-date") {
      return 1;
    }
    if (right.dayKey === "unknown-date") {
      return -1;
    }

    return right.dayKey.localeCompare(left.dayKey);
  });

  return {
    days,
    skippedInvalidCoordinateCount,
  };
}
