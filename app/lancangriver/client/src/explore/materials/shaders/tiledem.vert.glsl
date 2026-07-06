uniform sampler2D uDemTexture;
uniform float uDemReady;
uniform float uElevationScale;
uniform vec2 uDemTexelSize;

varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vWorldPos;

#include <fog_pars_vertex>

void main() {
  vUv = uv;

  vec3 displaced = position;

  if (uDemReady > 0.5) {
    vec3 demRgb = texture2D(uDemTexture, uv).rgb * 255.0;
    float elevation = (demRgb.r * 256.0 + demRgb.g + demRgb.b / 256.0) - 32768.0;
    displaced = position + normal * (elevation * uElevationScale);
  }

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPos = mvPosition.xyz;
  vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
