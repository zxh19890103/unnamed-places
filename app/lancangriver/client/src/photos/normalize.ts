import type { PhotoRecord, RawPhotoRecord } from "./types";

export function normalizePhotoRecords(raw: RawPhotoRecord[]): PhotoRecord[] {
  return raw
    .filter((item) => typeof item.filePath === "string")
    .map((item) => {
      const lat = item.lat ?? item.latitude;
      const lng = item.lng ?? item.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return null;
      }

      return {
        id: item.id ?? item.filePath!,
        filePath: item.filePath!,
        lat,
        lng,
        takenAt: item.takenAt ?? null,
      };
    })
    .filter((item): item is PhotoRecord => item !== null);
}
