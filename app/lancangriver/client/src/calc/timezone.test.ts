import { describe, expect, it } from "vitest";

import { getDateForLocalTimeAtLatLng } from "./timezone";

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour,
    minute: lookup.minute,
  };
}

describe("getDateForLocalTimeAtLatLng", () => {
  it("returns the requested wall-clock time for Mount Fuji", () => {
    const result = getDateForLocalTimeAtLatLng(
      { lat: 35.3606, lng: 138.7274 },
      "19:00",
      new Date("2026-06-27T12:00:00.000Z"),
    );

    expect(getZonedParts(result, "Asia/Tokyo")).toEqual({
      year: "2026",
      month: "06",
      day: "27",
      hour: "19",
      minute: "00",
    });
  });

  it("uses the local calendar day at the target coordinates", () => {
    const result = getDateForLocalTimeAtLatLng(
      { lat: 34.0522, lng: -118.2437 },
      "07:32",
      new Date("2026-06-27T01:00:00.000Z"),
    );

    expect(getZonedParts(result, "America/Los_Angeles")).toEqual({
      year: "2026",
      month: "06",
      day: "26",
      hour: "07",
      minute: "32",
    });
  });
});
