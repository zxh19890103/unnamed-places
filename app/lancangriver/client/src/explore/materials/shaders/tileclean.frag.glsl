uniform vec3 uColor;
uniform float uTextureReady;
uniform sampler2D uSatelliteTexture;

varying vec2 vUv;

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

void main() {
  vec4 color = texture2D(uSatelliteTexture, vUv);

  float exgr = calcExgr(color.rgb);
  float exgr01 = clamp(exgr * 0.5 + 0.5, 0.0, 1.0);
  float isveg = step(0.5, exgr01);
  float linearveg = 3.0 * smoothstep(0.5, 1.0, exgr01);
  float issoil = calcSoilIndexRGB(color.rgb);
  vec3 vegTinted = mix(color.rgb, vec3(0.243, 0.561, 0.294), isveg);
  vec3 soilTinted = mix(vegTinted, vec3(0.545, 0.463, 0.353), issoil);

  vec3 outputColor = mix(uColor, soilTinted, uTextureReady);

  gl_FragColor = vec4(outputColor, 1.0);
}
