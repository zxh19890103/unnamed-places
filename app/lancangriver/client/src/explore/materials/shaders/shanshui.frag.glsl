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
uniform vec3 uSummitColor;

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
  float elevation01 = pow(clamp(max(elevationMeters, 0.0) / 8848.0, 0.0, 1.0), 0.75);
  vec3 color = mix(uBaseTerrainColor, uSummitColor, elevation01);

  // Add a subtle green tint on mid slopes to suggest vegetated bands.
  float slopeGreenMask = smoothstep(10.0, 22.0, slopeDeg)
    * (1.0 - smoothstep(34.0, 50.0, slopeDeg));
  vec3 slopeGreenTint = vec3(0.50, 0.62, 0.42);
  color = mix(color, mix(color, slopeGreenTint, 0.22), slopeGreenMask);

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
  vec3 baseColor = terrainColorRamp(vHeightMeters, slopeDeg);
  float lightFactor = clamp(uAmbientStrength + lit * uDiffuseStrength, 0.0, 1.4);
  vec3 color = baseColor * lightFactor;

  gl_FragColor = vec4(color, 1.0);
}
