import { describe, expect, it } from "vitest";
import {
  ShanshuiMaterial,
  computeElevationRangeFromTerrariumPixels,
} from "./ShanshuiMaterial";
import { ELEVATION_SCALE } from "../../calc/constants";

describe("ShanshuiMaterial", () => {
  it("uses a terrain-scale displacement value by default", () => {
    const material = new ShanshuiMaterial();
    expect(material.uniforms.uDisplacementScale.value).toBe(ELEVATION_SCALE);
    material.dispose();
  });

  it("computes elevation bounds from terrarium DEM pixels", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255, 128, 0, 0, 255,
    ]);

    const range = computeElevationRangeFromTerrariumPixels(pixels, 3, 1);

    expect(range.minMeters).toBeCloseTo(-32768);
    expect(range.maxMeters).toBeCloseTo(32767.99609375);
  });
});
