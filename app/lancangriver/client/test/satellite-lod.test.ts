import { describe, expect, test } from "vitest";

import {
  chooseSatelliteZoom,
  enumerateChildTiles,
} from "../src/view/satellite-lod";

describe("chooseSatelliteZoom", () => {
  test.each([130_000, 95_000, 55_000, 30_000, 15_000, 5_000])(
    "always returns z11 at distance %i",
    (distanceToTile) => {
      expect(chooseSatelliteZoom(distanceToTile)).toBe(11);
    },
  );

  test.each([11, 12, 13, 14, 15, 16])(
    "ignores current zoom %i and stays z11",
    (currentZoom) => {
      expect(chooseSatelliteZoom(12_000, currentZoom)).toBe(11);
    },
  );

  test("remains z11 for very large and very small distances", () => {
    expect(chooseSatelliteZoom(0)).toBe(11);
    expect(chooseSatelliteZoom(1_000_000)).toBe(11);
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
