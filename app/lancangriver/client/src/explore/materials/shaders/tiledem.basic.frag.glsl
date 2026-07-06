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
uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
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

void main() {
  vec4 color = texture2D(uSatelliteTexture, vUv);

  vec3 outputColor = mix(uColor, color.rgb, uSatelliteReady);

  outputColor = applyContrast(outputColor, uContrast);
  outputColor = applySaturation(outputColor, uSaturation);
  outputColor = applyGamma(outputColor, uGamma);

  gl_FragColor = vec4(outputColor, 1.0);

  #include <fog_fragment>
}
