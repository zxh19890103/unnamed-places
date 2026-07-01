uniform vec2 uWorldUv;
uniform sampler2D uDemTexture;
uniform float uElevationScale;
varying vec2 vUv;

void main() {
  vUv = uv;

  vec3 demRgb = texture2D(uDemTexture, uWorldUv).rgb * 255.0;
  float elevation = (demRgb.r * 256.0 + demRgb.g + demRgb.b / 256.0) - 32768.0;
  vec3 displaced = position + normal * (elevation * uElevationScale);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
