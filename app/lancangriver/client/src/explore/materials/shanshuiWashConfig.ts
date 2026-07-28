export type WashPresetName = "high" | "balanced" | "low";

export type ShanshuiWashParams = {
  preset: WashPresetName;
  toneBands: number;
  edgeStrength: number;
  washContrast: number;
  hazeStrength: number;
  satelliteBlendOpacity: number;
  inkDarkness: number;
  paperLightness: number;
  ridgeStrength: number;
  valleyLift: number;
  satelliteShadowBoost: number;
};

const PRESETS: Record<WashPresetName, ShanshuiWashParams> = {
  high: {
    preset: "high",
    toneBands: 7,
    edgeStrength: 0.9,
    washContrast: 1.08,
    hazeStrength: 0.62,
    satelliteBlendOpacity: 0.18,
    inkDarkness: 0.98,
    paperLightness: 0.9,
    ridgeStrength: 0.95,
    valleyLift: 0.44,
    satelliteShadowBoost: 0.58,
  },
  balanced: {
    preset: "balanced",
    toneBands: 5,
    edgeStrength: 0.68,
    washContrast: 1,
    hazeStrength: 0.5,
    satelliteBlendOpacity: 0.14,
    inkDarkness: 0.86,
    paperLightness: 0.88,
    ridgeStrength: 0.68,
    valleyLift: 0.35,
    satelliteShadowBoost: 0.42,
  },
  low: {
    preset: "low",
    toneBands: 3,
    edgeStrength: 0.42,
    washContrast: 0.9,
    hazeStrength: 0.38,
    satelliteBlendOpacity: 0.12,
    inkDarkness: 0.74,
    paperLightness: 0.84,
    ridgeStrength: 0.42,
    valleyLift: 0.26,
    satelliteShadowBoost: 0.25,
  },
};

export const defaultWashParams = { ...PRESETS.balanced };

export function getWashPreset(name: WashPresetName): ShanshuiWashParams {
  return { ...PRESETS[name] };
}

export function clampWashParams(input: ShanshuiWashParams): ShanshuiWashParams {
  return {
    ...input,
    toneBands: Math.min(8, Math.max(2, Math.round(input.toneBands))),
    edgeStrength: Math.min(1.5, Math.max(0, input.edgeStrength)),
    washContrast: Math.min(2, Math.max(0.5, input.washContrast)),
    hazeStrength: Math.min(1.2, Math.max(0, input.hazeStrength)),
    inkDarkness: Math.min(1.2, Math.max(0.45, input.inkDarkness)),
    paperLightness: Math.min(1, Math.max(0.65, input.paperLightness)),
    ridgeStrength: Math.min(1.5, Math.max(0, input.ridgeStrength)),
    valleyLift: Math.min(1, Math.max(0, input.valleyLift)),
    satelliteShadowBoost: Math.min(1, Math.max(0, input.satelliteShadowBoost)),
    satelliteBlendOpacity: Math.min(
      0.35,
      Math.max(0, input.satelliteBlendOpacity),
    ),
  };
}

export function degradeWashParams(
  params: ShanshuiWashParams,
): ShanshuiWashParams {
  return clampWashParams({
    ...params,
    toneBands: params.toneBands - 1,
    edgeStrength: params.edgeStrength * 0.9,
    hazeStrength: params.hazeStrength * 0.9,
    ridgeStrength: params.ridgeStrength * 0.88,
    valleyLift: params.valleyLift * 0.92,
    satelliteShadowBoost: params.satelliteShadowBoost * 0.88,
  });
}

export function recoverWashParams(
  params: ShanshuiWashParams,
  targetPreset: WashPresetName,
): ShanshuiWashParams {
  const target = getWashPreset(targetPreset);
  return clampWashParams({
    ...params,
    toneBands: Math.min(target.toneBands, params.toneBands + 1),
    edgeStrength: Math.min(target.edgeStrength, params.edgeStrength + 0.05),
    hazeStrength: Math.min(target.hazeStrength, params.hazeStrength + 0.05),
    ridgeStrength: Math.min(target.ridgeStrength, params.ridgeStrength + 0.05),
    valleyLift: Math.min(target.valleyLift, params.valleyLift + 0.03),
    satelliteShadowBoost: Math.min(
      target.satelliteShadowBoost,
      params.satelliteShadowBoost + 0.05,
    ),
  });
}
