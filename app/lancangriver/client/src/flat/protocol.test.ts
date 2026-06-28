import { describe, expect, it } from "vitest";

import {
  buildFlatModalUrl,
  FLAT_CENTER_CONFIRMED,
  readInitialCenterFromSearch,
} from "./protocol";

describe("flat protocol", () => {
  it("builds flat modal url with lat/lng query params", () => {
    const url = buildFlatModalUrl({ lat: 25.0389, lng: 102.7183 });

    expect(url).toBe("/flat.html?lat=25.0389&lng=102.7183");
  });

  it("omits query params when center is unavailable", () => {
    expect(buildFlatModalUrl(null)).toBe("/flat.html");
  });

  it("reads initial center from query string", () => {
    expect(readInitialCenterFromSearch("?lat=25.0389&lng=102.7183")).toEqual({
      lat: 25.0389,
      lng: 102.7183,
    });
  });

  it("returns null for invalid query params", () => {
    expect(readInitialCenterFromSearch("?lat=abc&lng=102.7183")).toBeNull();
    expect(readInitialCenterFromSearch("?lng=102.7183")).toBeNull();
  });

  it("exposes a stable message type", () => {
    expect(FLAT_CENTER_CONFIRMED).toBe("flat:center-confirmed");
  });
});
