uniform vec3 uColor;
uniform float uTextureReady;
uniform sampler2D uSatelliteTexture;

varying vec2 vUv;
varying vec3 vWorldPos;

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
  vec3 outputColor = mix(loadingPlaceholder(vUv), color.rgb, uTextureReady);

  gl_FragColor = vec4(outputColor, 1.0);
}
