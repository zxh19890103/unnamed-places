import { describe, expect, it } from "vitest";
import { buildJourneyDays } from "./journey";
import type { JourneyDayNode } from "./types";

describe("JourneyDayNode type", () => {
  it("supports required fields", () => {
    const sample: JourneyDayNode = {
      dayKey: "2026-06-28",
      displayLabel: "2026-06-28",
      photoCount: 2,
      representativeLat: 40.746,
      representativeLng: 14.498,
      placeChips: ["40.75, 14.50"],
      photoIds: ["1", "2"],
    };

    expect(sample.photoCount).toBe(2);
  });
});

describe("buildJourneyDays", () => {
  it("groups parseable timestamps by local day", () => {
    const result = buildJourneyDays([
      {
        id: "1",
        filePath: "a.jpg",
        lat: 40,
        lng: 14,
        takenAt: "2026-06-28T08:00:00.000Z",
      },
      {
        id: "2",
        filePath: "b.jpg",
        lat: 40.1,
        lng: 14.1,
        takenAt: "2026-06-28T10:00:00.000Z",
      },
    ]);

    expect(result.days).toHaveLength(1);
    expect(result.days[0].photoCount).toBe(2);
  });

  it("routes missing or invalid takenAt to unknown-date", () => {
    const result = buildJourneyDays([
      { id: "1", filePath: "a.jpg", lat: 40, lng: 14, takenAt: null },
      { id: "2", filePath: "b.jpg", lat: 41, lng: 15, takenAt: "not-a-date" },
    ]);

    expect(result.days.at(-1)?.dayKey).toBe("unknown-date");
  });

  it("skips invalid coordinates and tracks skipped count", () => {
    const result = buildJourneyDays([
      { id: "1", filePath: "a.jpg", lat: 40, lng: 14, takenAt: null },
      { id: "2", filePath: "b.jpg", lat: Number.NaN, lng: 15, takenAt: null },
    ]);

    expect(result.skippedInvalidCoordinateCount).toBe(1);
  });
});
