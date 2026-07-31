import { describe, expect, it } from "vitest";
import { ShanshuiMaterial } from "./ShanshuiMaterial";
import { ELEVATION_SCALE } from "../../calc/constants";

describe("ShanshuiMaterial", () => {
  it("uses a terrain-scale displacement value by default", () => {
    const material = new ShanshuiMaterial();
    expect(material.uniforms.uDisplacementScale.value).toBe(ELEVATION_SCALE);
    material.dispose();
  });
});
