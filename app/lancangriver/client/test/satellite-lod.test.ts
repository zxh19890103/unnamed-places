import { describe, expect, test } from "vitest";

import {
  chooseSatelliteZoom,
  enumerateChildTiles,
} from "../src/view/satellite-lod";

describe("chooseSatelliteZoom", () => {
  test.each([
    [130_000, 11],
    [95_000, 12],
    [55_000, 13],
    [30_000, 14],
    [15_000, 15],
    [5_000, 16],
  ])("maps distance %i to z%i", (distanceToTile, expectedZoom) => {
    expect(chooseSatelliteZoom(distanceToTile)).toBe(expectedZoom);
  });

  test.each([
    [11, 118_000, 11],
    [11, 114_000, 12],
    [12, 122_000, 12],
    [12, 126_000, 11],
    [12, 68_000, 12],
    [12, 64_000, 13],
    [13, 72_000, 13],
    [13, 76_000, 12],
    [13, 38_000, 13],
    [13, 34_000, 14],
    [14, 24_000, 14],
    [14, 16_000, 15],
    [15, 14_000, 15],
    [15, 6_000, 16],
  ])(
    "holds z%i around a boundary at distance %i",
    (currentZoom, distanceToTile, expectedZoom) => {
      expect(chooseSatelliteZoom(distanceToTile, currentZoom)).toBe(
        expectedZoom,
      );
    },
  );

  test("jumps directly to the matching band when current zoom is far away", () => {
    expect(chooseSatelliteZoom(55_000, 11)).toBe(13);
    expect(chooseSatelliteZoom(15_000, 11)).toBe(15);
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
