import { describe, expect, test } from "vitest";

import { enumerateChildTiles } from "../src/calc/mercator";

describe("enumerateChildTiles", () => {
  test("returns the base tile with zero offsets when no refinement is needed", () => {
    expect(enumerateChildTiles({ z: 11, x: 1234, y: 567 }, 11)).toEqual([
      { z: 11, x: 1234, y: 567, offsetX: 0, offsetY: 0 },
    ]);
  });

  test("returns normalized offsets for a 2x2 refinement", () => {
    expect(enumerateChildTiles({ z: 11, x: 100, y: 200 }, 12)).toEqual([
      { z: 12, x: 200, y: 400, offsetX: 0, offsetY: 0 },
      { z: 12, x: 201, y: 400, offsetX: 0.5, offsetY: 0 },
      { z: 12, x: 200, y: 401, offsetX: 0, offsetY: 0.5 },
      { z: 12, x: 201, y: 401, offsetX: 0.5, offsetY: 0.5 },
    ]);
  });

  test("returns normalized offsets for larger zoom deltas", () => {
    const result = enumerateChildTiles({ z: 11, x: 3, y: 5 }, 13);

    expect(result).toHaveLength(16);
    expect(result[0]).toEqual({ z: 13, x: 12, y: 20, offsetX: 0, offsetY: 0 });
    expect(result[15]).toEqual({
      z: 13,
      x: 15,
      y: 23,
      offsetX: 0.75,
      offsetY: 0.75,
    });
  });
});
