uniform vec3 uColor;
uniform float uTextureReady;
uniform sampler2D uSatelliteTexture;

varying vec2 vUv;

void main() {
  vec4 color = texture2D(uSatelliteTexture, vUv);
  vec3 outputColor = mix(uColor, color.rgb, uTextureReady);

  gl_FragColor = vec4(outputColor, 1.0);
}
