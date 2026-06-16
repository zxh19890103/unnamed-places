import { describe, expect, test } from "vitest";

import {
  chooseSatelliteZoom,
  enumerateChildTiles,
} from "../src/view/satellite-lod";
import {
  AGGRESSIVE_PROFILE,
  CONSERVATIVE_PROFILE,
} from "../src/view/lod-profile";

const TILE_SPAN = 30_720;

describe("chooseSatelliteZoom", () => {
  test.each([
    { distance: 5 * TILE_SPAN, expectedZoom: 11 },
    { distance: 3 * TILE_SPAN, expectedZoom: 12 },
    { distance: 1.5 * TILE_SPAN, expectedZoom: 13 },
  ])(
    "selects the correct distance band for $distance",
    ({ distance, expectedZoom }) => {
      expect(
        chooseSatelliteZoom(distance, undefined, CONSERVATIVE_PROFILE),
      ).toBe(expectedZoom);
    },
  );

  test("applies hysteresis near a band boundary", () => {
    const distance = 1.95 * TILE_SPAN;

    expect(chooseSatelliteZoom(distance, 13, CONSERVATIVE_PROFILE)).toBe(13);
    expect(chooseSatelliteZoom(2.15 * TILE_SPAN, 13, CONSERVATIVE_PROFILE)).toBe(
      12,
    );
  });

  test("uses the supplied LOD profile to allow deeper zooms", () => {
    expect(
      chooseSatelliteZoom(0.3 * TILE_SPAN, undefined, AGGRESSIVE_PROFILE),
    ).toBe(14);
  });
});

describe("enumerateChildTiles", () => {
  test("returns only original tile when target zoom equals base zoom", () => {
    const result = enumerateChildTiles({ z: 11, x: 1234, y: 567 }, 11);
    expect(result).toEqual([
      { z: 11, x: 1234, y: 567, offsetX: 0, offsetY: 0 },
    ]);
  });

  test("returns 2x2 children for z11 -> z12", () => {
    const result = enumerateChildTiles({ z: 11, x: 100, y: 200 }, 12);
    expect(result).toEqual([
      { z: 12, x: 200, y: 400, offsetX: 0, offsetY: 0 },
      { z: 12, x: 201, y: 400, offsetX: 1, offsetY: 0 },
      { z: 12, x: 200, y: 401, offsetX: 0, offsetY: 1 },
      { z: 12, x: 201, y: 401, offsetX: 1, offsetY: 1 },
    ]);
  });

  test("returns the full child grid for larger zoom deltas", () => {
    const result = enumerateChildTiles({ z: 11, x: 3, y: 5 }, 13);

    expect(result).toHaveLength(16);
    expect(result[0]).toEqual({ z: 13, x: 12, y: 20, offsetX: 0, offsetY: 0 });
    expect(result[15]).toEqual({ z: 13, x: 15, y: 23, offsetX: 3, offsetY: 3 });
  });
});
