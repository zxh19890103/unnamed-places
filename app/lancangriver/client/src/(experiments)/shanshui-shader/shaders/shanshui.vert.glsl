varying vec2 vUv;
varying float vHeightMeters;

uniform sampler2D uDemTexture;
uniform float uDemReady;
uniform float uDisplacementScale;

float decodeTerrariumHeight(vec3 rgb) {
  return (rgb.r * 255.0 * 256.0 + rgb.g * 255.0 + (rgb.b * 255.0) / 256.0) - 32768.0;
}

void main() {
  vUv = uv;
  vHeightMeters = 0.0;

  vec3 displacedPosition = position;

  if (uDemReady > 0.5) {
    vec3 demRgb = texture2D(uDemTexture, uv).rgb;
    float heightMeters = decodeTerrariumHeight(demRgb);
    vHeightMeters = heightMeters;
    displacedPosition += normal * (heightMeters * uDisplacementScale);
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}
