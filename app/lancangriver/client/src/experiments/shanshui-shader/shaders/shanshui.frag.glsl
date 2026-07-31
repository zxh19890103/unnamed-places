varying vec2 vUv;
varying float vHeightMeters;
uniform sampler2D uDerivativesTexture;
uniform sampler2D uDemTexture;
uniform float uDerivativesReady;
uniform float uSunAzimuthRad;
uniform float uSunElevationRad;
uniform float uAmbientStrength;
uniform float uDiffuseStrength;
uniform float uShowNormals;
uniform vec2 uDemTexelSize;
uniform float uSlopeDarkenStrength;
uniform float uElevationMinMeters;
uniform float uElevationMaxMeters;
uniform vec3 uBaseTerrainColor;
uniform vec3 uSteepColor;
vec3 normalFromSlopeAspect(float slopeRad, float aspectRad) {
  vec3 n = vec3(
    sin(slopeRad) * cos(aspectRad),
    sin(slopeRad) * sin(aspectRad),
    cos(slopeRad)
  );
  return normalize(n);
}
float hillshade(float slopeRad, float aspectRad, float sunAzimuth, float sunElevation) {
  float zenith = 1.57079632679 - sunElevation;
  return cos(zenith) * cos(slopeRad)
    + sin(zenith) * sin(slopeRad) * cos(sunAzimuth - aspectRad);
}
vec3 terrainColorRamp(float elevationMeters, float slopeDeg) {
  float elevationRange = max(uElevationMaxMeters - uElevationMinMeters, 1.0);
  float elevation01 = clamp((elevationMeters - uElevationMinMeters) / elevationRange, 0.0, 1.0);
  float s = clamp(slopeDeg / 90.0, 0.0, 1.0);
  vec3 baseTerrain = uBaseTerrainColor;
  vec3 steepTint = uSteepColor;
  vec3 valleyTint = baseTerrain * vec3(0.70, 0.78, 0.74);
  vec3 midTint = baseTerrain;
  vec3 ridgeTint = mix(baseTerrain, steepTint, 0.52);
  float valleyToMid = smoothstep(0.08, 0.58, elevation01);
  float midToRidge = smoothstep(0.52, 0.98, elevation01);
  vec3 valleyMidTint = mix(valleyTint, midTint, valleyToMid);
  vec3 elevationTint = mix(valleyMidTint, ridgeTint, midToRidge);
  float snowline = smoothstep(0.86, 0.98, elevation01);
  vec3 summitTint = mix(steepTint, vec3(0.94, 0.95, 0.92), 0.72);
  elevationTint = mix(elevationTint, summitTint, snowline * 0.78);
  vec3 slopeTint = mix(elevationTint, steepTint, s * 0.35);
  float darkenTarget = clamp(1.0 - 0.45 * uSlopeDarkenStrength, 0.0, 1.0);
  float slopeDarken = mix(1.0, darkenTarget, smoothstep(0.93, 0.95, s));
  return slopeTint * slopeDarken;
}
vec3 terrainColorRamp1(float elevationMeters, float slopeDeg) {
  float elevationRange = max(uElevationMaxMeters - uElevationMinMeters, 1.0);
  float elevation01 = clamp((elevationMeters - uElevationMinMeters) / elevationRange, 0.0, 1.0);
  float s = clamp(slopeDeg / 90.0, 0.0, 1.0);
  vec3 color = mix(uBaseTerrainColor, uSteepColor, elevation01);
  float steepMask = smoothstep(0.95, 0.98, s);
  float steepFactor = mix(1.0, 0.65, steepMask);
  color *= steepFactor;
  return color;
}
float decodeTerrariumHeight(vec3 rgb) {
  return (rgb.r * 255.0 * 256.0 + rgb.g * 255.0 + (rgb.b * 255.0) / 256.0) - 32768.0;
}
float sampleHeight(vec2 uv) {
  return decodeTerrariumHeight(texture2D(uDemTexture, uv).rgb);
}
void main() {
  if (uDerivativesReady < 0.5) {
    gl_FragColor = vec4(0.22, 0.24, 0.28, 1.0);
    return;
  }
  vec4 derivativesSample = texture2D(uDerivativesTexture, vUv);
  float slopeDeg = derivativesSample.r * 90.0;
  float sinAspect = derivativesSample.g * 2.0 - 1.0;
  float cosAspect = derivativesSample.b * 2.0 - 1.0;
  float aspectRad = atan(sinAspect, cosAspect);
  if (aspectRad < 0.0) {
    aspectRad += 6.28318530718;
  }
  float slopeRad = radians(slopeDeg);
  vec3 terrainNormal = normalFromSlopeAspect(slopeRad, aspectRad);
  if (uShowNormals > 0.5) {
    vec3 normalColor = terrainNormal * 0.5 + 0.5;
    gl_FragColor = vec4(normalColor, 1.0);
    return;
  }
  float lit = max(hillshade(slopeRad, aspectRad, uSunAzimuthRad, uSunElevationRad), 0.0);
  vec3 baseColor = terrainColorRamp1(vHeightMeters, slopeDeg);
  float lightFactor = clamp(uAmbientStrength + lit * uDiffuseStrength, 0.0, 1.4);
  vec3 color = baseColor;
  gl_FragColor = vec4(color, 1.0);
}
