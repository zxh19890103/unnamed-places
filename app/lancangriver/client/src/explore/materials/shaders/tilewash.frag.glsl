uniform vec3 uColor;
uniform sampler2D uSatelliteTexture;
uniform float uTextureReady;
uniform float uToneBands;
uniform float uInkEdgeStrength;
uniform float uWashContrast;
uniform float uHazeStrength;
uniform float uSatelliteBlendOpacity;
uniform float uCameraDistanceMeters;
uniform float uInkDarkness;
uniform float uPaperLightness;
uniform float uRidgeStrength;
uniform float uValleyLift;
uniform float uSatelliteShadowBoost;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPositionW;

float quantizeBands(float value, float bands) {
  float b = max(2.0, bands);
  return floor(value * b) / b;
}

float remap01(float value, float inMin, float inMax) {
  return clamp((value - inMin) / max(0.0001, inMax - inMin), 0.0, 1.0);
}

vec3 desaturate(vec3 color, float amount) {
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(color, vec3(luma), clamp(amount, 0.0, 1.0));
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 viewDir = normalize(cameraPosition - vPositionW);
  vec3 lightDir = normalize(vec3(0.35, 0.8, 0.2));
  float lambert = max(dot(n, lightDir), 0.0);
  float ndv = max(dot(n, viewDir), 0.0);

  float ridge = pow(1.0 - ndv, 1.6) * uRidgeStrength;
  float valley = pow(max(0.0, 1.0 - lambert), 1.35) * uValleyLift;
  float tonal = clamp(mix(lambert, lambert + ridge - valley * 0.35, 0.65), 0.0, 1.0);
  tonal = pow(tonal, 1.0 / max(0.5, uWashContrast));

  float softBands = quantizeBands(tonal, uToneBands);
  float bandBlend = remap01(fract(tonal * max(2.0, uToneBands)), 0.25, 0.75);
  float washBase = mix(softBands, tonal, bandBlend * 0.25);

  float edge = pow(1.0 - ndv, 1.9) * uInkEdgeStrength;
  edge += ridge * 0.35;
  edge = clamp(edge, 0.0, 1.0);

  vec3 paper = vec3(0.92, 0.92, 0.88) * uPaperLightness;
  vec3 midWash = vec3(0.50, 0.56, 0.60);
  vec3 ink = vec3(0.12, 0.16, 0.19) * uInkDarkness;

  vec3 washColor = mix(paper, midWash, washBase);
  washColor = mix(washColor, ink, edge * 0.55);

  vec3 satColor = texture2D(uSatelliteTexture, vUv).rgb;
  satColor = desaturate(satColor, 0.45);
  float satToneMask = mix(0.45, 1.0, pow(1.0 - washBase, 1.1));
  satToneMask *= mix(0.55, 1.0, uSatelliteShadowBoost);
  float satMix = (uTextureReady > 0.5) ? uSatelliteBlendOpacity * satToneMask : 0.0;

  vec3 color = mix(washColor, satColor, satMix);

  float hazeT = clamp(uCameraDistanceMeters / 320000.0, 0.0, 1.0) * uHazeStrength;
  vec3 hazeColor = vec3(0.81, 0.85, 0.86);
  color = mix(color, hazeColor, hazeT);

  gl_FragColor = vec4(color, 1.0);
}
