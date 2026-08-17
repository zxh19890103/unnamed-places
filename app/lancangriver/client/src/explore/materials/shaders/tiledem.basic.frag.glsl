uniform sampler2D uSatelliteTexture;
uniform float uSatelliteReady;

uniform float uSaturation;
uniform float uContrast;
uniform float uGamma;
uniform float uVegLightStrength;
uniform vec3 uColor;

varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vWorldPos;

#include <fog_pars_fragment>

uniform vec3 ambientLightColor;

#if NUM_DIR_LIGHTS > 0
struct DirectionalLight {
  vec3 direction;
  vec3 color;
};
uniform DirectionalLight directionalLights[NUM_DIR_LIGHTS];
#endif

vec3 applySaturation(vec3 color, float saturation) {
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luma), color, saturation);
}

vec3 applyContrast(vec3 color, float contrast) {
  return clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0);
}

vec3 applyGamma(vec3 color, float gammaValue) {
  float safeGamma = max(gammaValue, 0.001);
  return pow(max(color, vec3(0.0)), vec3(1.0 / safeGamma));
}

float gridLine(vec2 uv, float divisions, float width) {
  vec2 cell = fract(uv * divisions);
  vec2 distanceToLine = min(cell, 1.0 - cell);
  return 1.0 - smoothstep(0.0, width, min(distanceToLine.x, distanceToLine.y));
}

vec3 loadingPlaceholder(vec2 uv) {
  vec3 baseColor = vec3(0.36, 0.38, 0.40);
  vec3 minorGridColor = vec3(0.42, 0.44, 0.46);
  vec3 majorGridColor = vec3(0.48, 0.50, 0.52);

  float minorGrid = gridLine(uv, 8.0, 0.045);
  float majorGrid = gridLine(uv, 2.0, 0.018);
  float tileBorder = gridLine(uv, 1.0, 0.012);

  vec3 placeholder = mix(baseColor, minorGridColor, minorGrid);
  placeholder = mix(placeholder, majorGridColor, majorGrid);
  return mix(placeholder, vec3(0.27, 0.29, 0.31), tileBorder);
}

void main() {
  vec4 color = texture2D(uSatelliteTexture, vUv);

  vec3 outputColor = mix(loadingPlaceholder(vUv), color.rgb, uSatelliteReady);

  outputColor = applyContrast(outputColor, uContrast);
  outputColor = applySaturation(outputColor, uSaturation);
  outputColor = applyGamma(outputColor, uGamma);

  gl_FragColor = vec4(outputColor, 1.0);

  #include <fog_fragment>
}
