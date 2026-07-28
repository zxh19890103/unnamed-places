import { describe, expect, it } from "vitest";
import {
  clampWashParams,
  defaultWashParams,
  degradeWashParams,
  getWashPreset,
  recoverWashParams,
} from "./shanshuiWashConfig";

describe("shanshuiWashConfig", () => {
  it("returns balanced preset as default", () => {
    expect(defaultWashParams.preset).toBe("balanced");
    expect(defaultWashParams.satelliteBlendOpacity).toBeLessThanOrEqual(0.35);
    expect(defaultWashParams.inkDarkness).toBeGreaterThan(0);
    expect(defaultWashParams.ridgeStrength).toBeGreaterThan(0);
  });

  it("clamps unsafe values into valid ranges", () => {
    const clamped = clampWashParams({
      toneBands: 99,
      satelliteBlendOpacity: 1,
      hazeStrength: 999,
      edgeStrength: -4,
      washContrast: -1,
      inkDarkness: 9,
      paperLightness: -4,
      ridgeStrength: -2,
      valleyLift: -2,
      satelliteShadowBoost: 4,
      preset: "balanced",
    });

    expect(clamped.toneBands).toBeLessThanOrEqual(8);
    expect(clamped.satelliteBlendOpacity).toBeLessThanOrEqual(0.35);
    expect(clamped.edgeStrength).toBeGreaterThanOrEqual(0);
    expect(clamped.inkDarkness).toBeLessThanOrEqual(1.2);
    expect(clamped.paperLightness).toBeGreaterThanOrEqual(0.65);
    expect(clamped.ridgeStrength).toBeGreaterThanOrEqual(0);
    expect(clamped.valleyLift).toBeGreaterThanOrEqual(0);
    expect(clamped.satelliteShadowBoost).toBeLessThanOrEqual(1);
  });

  it("degrades and recovers quality without leaving bounds", () => {
    const high = getWashPreset("high");
    const degraded = degradeWashParams(high);
    const recovered = recoverWashParams(degraded, "high");

    expect(degraded.toneBands).toBeLessThanOrEqual(high.toneBands);
    expect(degraded.ridgeStrength).toBeLessThanOrEqual(high.ridgeStrength);
    expect(degraded.satelliteShadowBoost).toBeLessThanOrEqual(
      high.satelliteShadowBoost,
    );
    expect(recovered.toneBands).toBeLessThanOrEqual(8);
    expect(recovered.satelliteBlendOpacity).toBeLessThanOrEqual(0.35);
    expect(recovered.ridgeStrength).toBeLessThanOrEqual(high.ridgeStrength);
    expect(recovered.valleyLift).toBeLessThanOrEqual(high.valleyLift);
  });

  it("keeps all presets distinct for style tuning", () => {
    const high = getWashPreset("high");
    const balanced = getWashPreset("balanced");
    const low = getWashPreset("low");

    expect(high.toneBands).toBeGreaterThan(balanced.toneBands);
    expect(balanced.toneBands).toBeGreaterThan(low.toneBands);
    expect(high.ridgeStrength).toBeGreaterThan(low.ridgeStrength);
    expect(high.inkDarkness).toBeGreaterThan(low.inkDarkness);
    expect(high.satelliteShadowBoost).toBeGreaterThan(low.satelliteShadowBoost);
  });
});
