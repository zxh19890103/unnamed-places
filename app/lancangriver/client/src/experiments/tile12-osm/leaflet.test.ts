import { describe, expect, it } from "vitest";

import { getLeafletFeatureStyle } from "./leafletStyle";

describe("getLeafletFeatureStyle", () => {
  it("uses a building style for building-like features", () => {
    const style = getLeafletFeatureStyle({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [] },
      properties: { building: "yes" },
    });

    expect(style.color).toBe("#f59e0b");
    expect(style.fillColor).toBe("#f59e0b");
  });

  it("uses a water style for water features", () => {
    const style = getLeafletFeatureStyle({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [] },
      properties: { natural: "water" },
    });

    expect(style.color).toBe("#38bdf8");
    expect(style.fillColor).toBe("#38bdf8");
  });
});
