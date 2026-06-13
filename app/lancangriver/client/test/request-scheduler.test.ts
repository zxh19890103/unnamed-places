import { describe, expect, it } from "vitest";
import { computeRequestPlan } from "../src/view/request-scheduler";

describe("computeRequestPlan", () => {
  it("returns bbox and raster tiles for viewport", () => {
    const plan = computeRequestPlan({
      centerLon: 100.5,
      centerLat: 22.1,
      zoom: 11,
      viewportWidthPx: 1024,
      viewportHeightPx: 768,
    });

    expect(plan.vectorBbox.length).toBe(4);
    expect(plan.vectorBbox[0]).toBeLessThan(plan.vectorBbox[2]);
    expect(plan.vectorBbox[1]).toBeLessThan(plan.vectorBbox[3]);
    expect(plan.rasterTiles.length).toBeGreaterThan(0);
  });

  it("uses integer zoom for tile planning", () => {
    const plan = computeRequestPlan({
      centerLon: 100.5,
      centerLat: 22.1,
      zoom: 11.8,
      viewportWidthPx: 512,
      viewportHeightPx: 512,
    });

    expect(plan.rasterTiles.every((tile) => tile.z === 11)).toBe(true);
  });
});
