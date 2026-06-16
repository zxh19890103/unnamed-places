import { describe, it, expect } from "vitest";
import { chooseSatelliteZoom } from "./satellite-lod";
import { CONSERVATIVE_PROFILE, AGGRESSIVE_PROFILE } from "./lod-profile";

const TILE_SPAN = 30_720;

describe("chooseSatelliteZoom", () => {
  it("returns z11 for far distances in conservative profile", () => {
    const distance = 5 * TILE_SPAN;
    const result = chooseSatelliteZoom(distance, undefined, CONSERVATIVE_PROFILE);
    expect(result).toBe(11);
  });

  it("returns z12 for medium distances in conservative profile", () => {
    const distance = 3 * TILE_SPAN;
    const result = chooseSatelliteZoom(distance, undefined, CONSERVATIVE_PROFILE);
    expect(result).toBe(12);
  });

  it("returns z13 for near distances in conservative profile", () => {
    const distance = 1.5 * TILE_SPAN;
    const result = chooseSatelliteZoom(distance, undefined, CONSERVATIVE_PROFILE);
    expect(result).toBe(13);
  });

  it("applies hysteresis: stays at z12 when moving from z13 to z12 boundary", () => {
    const distance = 1.95 * TILE_SPAN;
    const result = chooseSatelliteZoom(distance, 13, CONSERVATIVE_PROFILE);
    expect(result).toBe(13);
  });

  it("merges to z12 when distance clearly exceeds merge threshold", () => {
    const distance = 2.15 * TILE_SPAN;
    const result = chooseSatelliteZoom(distance, 13, CONSERVATIVE_PROFILE);
    expect(result).toBe(12);
  });

  it("returns z14 for very close distances in aggressive profile", () => {
    const distance = 0.3 * TILE_SPAN;
    const result = chooseSatelliteZoom(distance, undefined, AGGRESSIVE_PROFILE);
    expect(result).toBe(14);
  });
});
