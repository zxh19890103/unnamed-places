uniform sampler2D uSatelliteTexture;
uniform float uSatelliteReady;

uniform float uSaturation;
uniform float uContrast;
uniform float uGamma;
uniform float uVegLightStrength;
uniform vec3 uColor;

varying vec2 vUv;
varying vec3 vViewPos;

#include <fog_pars_fragment>

uniform vec3 ambientLightColor;

#if NUM_DIR_LIGHTS > 0
struct DirectionalLight {
  vec3 direction;
  vec3 color;
};
uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
#endif

float calcExgr(vec3 rgb) {

  float total = rgb.r + rgb.g + rgb.b + 0.000001;

  float rn = rgb.r / total;
  float gn = rgb.g / total;
  float bn = rgb.b / total;

  float exg = 2.0 * gn - rn - bn;
  float exr = 1.4 * rn - gn;
  float exgr = exg - exr;

  return exgr;
}

float calcSoilIndexRGB(vec3 rgb) {
  float exgr = calcExgr(rgb);

  float mx = max(rgb.r, max(rgb.g, rgb.b));
  float mn = min(rgb.r, min(rgb.g, rgb.b));
  float sat = (mx > 1e-6) ? (mx - mn) / mx : 0.0; // HSV saturation
  float val = mx; // HSV value

  float dryTone = clamp((rgb.r - rgb.g) * 2.0 + (rgb.r - rgb.b) * 0.5, 0.0, 1.0);
  float nonVeg = 1.0 - smoothstep(0.00, 0.15, exgr);
  float midBright = smoothstep(0.15, 0.35, val) * (1.0 - smoothstep(0.80, 0.98, val));
  float lowToMidSat = 1.0 - smoothstep(0.35, 0.75, sat);

  return clamp(dryTone * nonVeg * midBright * (0.6 + 0.4 * lowToMidSat), 0.0, 1.0);
}

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

vec3 calcTerrainNormalView() {
  vec3 dpdx = dFdx(vViewPos);
  vec3 dpdy = dFdy(vViewPos);
  vec3 normalView = normalize(cross(dpdx, dpdy));

  vec3 viewDir = normalize(-vViewPos);
  if (dot(normalView, viewDir) < 0.0) {
    normalView = -normalView;
  }

  return normalView;
}

vec3 calcVegetationLight(vec3 normalView) {
  vec3 lightColor = ambientLightColor;

  #if NUM_DIR_LIGHTS > 0
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      float ndl = max(dot(normalView, directionalLights[i].direction), 0.0);
      lightColor += ndl * directionalLights[i].color;
    }
  #endif

  return max(lightColor, vec3(0.2));
}

void main() {
  vec4 color = texture2D(uSatelliteTexture, vUv);

  float exgr = calcExgr(color.rgb);
  float exgr01 = clamp(exgr * 0.5 + 0.5, 0.0, 1.0);
  float isveg = step(0.5, exgr01);
  float linearveg = 3.0 * smoothstep(0.5, 1.0, exgr01);
  float issoil = calcSoilIndexRGB(color.rgb);
  
  vec3 vegTinted = mix(color.rgb, vec3(0.243, 0.561, 0.294), isveg);

  vec3 terrainNormalView = calcTerrainNormalView();
  vec3 vegetationLight = calcVegetationLight(terrainNormalView);
  float vegLightMix = clamp(isveg * uVegLightStrength, 0.0, 1.0);
  vec3 vegLit = mix(vegTinted, vegTinted * vegetationLight, vegLightMix);

  vec3 soilTinted = mix(vegLit, vec3(0.545, 0.463, 0.353), issoil);

  vec3 outputColor = mix(uColor, soilTinted, uSatelliteReady);

  outputColor = applyContrast(outputColor, uContrast);
  outputColor = applySaturation(outputColor, uSaturation);
  outputColor = applyGamma(outputColor, uGamma);

  gl_FragColor = vec4(outputColor, 1.0);

  #include <fog_fragment>
}
