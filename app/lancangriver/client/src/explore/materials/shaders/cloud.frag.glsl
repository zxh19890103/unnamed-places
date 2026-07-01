uniform vec3 uColor;
uniform float uOpacity;
uniform float uSoftness;
uniform sampler2D uAtlasTexture;
uniform float uAtlasGrid;

varying float vSpriteIndex;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float index = floor(vSpriteIndex + 0.5);
  float col = mod(index, uAtlasGrid);
  float row = floor(index / uAtlasGrid);

  vec2 atlasUv = (vec2(col, row) + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)) / uAtlasGrid;
  vec4 atlasSample = texture2D(uAtlasTexture, atlasUv);

  vec2 centered = gl_PointCoord - vec2(0.5);
  float dist = length(centered) * 2.0;

  float alphaMask = 1.0 - smoothstep(1.0 - uSoftness, 1.0, dist);
  float grain = mix(0.94, 1.0, hash12(gl_PointCoord * 31.0));
  float alpha = uOpacity * alphaMask * atlasSample.a * grain;

  if (alpha <= 0.001) {
    discard;
  }

  gl_FragColor = vec4(uColor * atlasSample.rgb, alpha);
}
