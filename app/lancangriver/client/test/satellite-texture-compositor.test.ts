import { describe, expect, test } from "vitest";

import { enumerateSatelliteCoverage } from "../src/view/satellite-texture-compositor";

describe("enumerateSatelliteCoverage", () => {
  test("returns a 2x2 grid for z11 -> z12", () => {
    const result = enumerateSatelliteCoverage({ z: 11, x: 100, y: 200 }, 12);

    expect(result).toEqual([
      { z: 12, x: 200, y: 400, offsetX: 0, offsetY: 0 },
      { z: 12, x: 201, y: 400, offsetX: 1, offsetY: 0 },
      { z: 12, x: 200, y: 401, offsetX: 0, offsetY: 1 },
      { z: 12, x: 201, y: 401, offsetX: 1, offsetY: 1 },
    ]);
  });

  test("returns a 16x16 grid for z11 -> z15", () => {
    const result = enumerateSatelliteCoverage({ z: 11, x: 3, y: 5 }, 15);

    expect(result).toHaveLength(256);
    expect(result[0]).toEqual({ z: 15, x: 48, y: 80, offsetX: 0, offsetY: 0 });
    expect(result[255]).toEqual({ z: 15, x: 63, y: 95, offsetX: 15, offsetY: 15 });
  });
});