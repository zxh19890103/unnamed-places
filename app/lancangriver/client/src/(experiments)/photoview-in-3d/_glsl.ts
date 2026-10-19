export const __glsl_chunks_cbs__ = /* glsl */ `

// 1. BRIGHTNESS
// u_brightness: 0.0 = black, 1.0 = normal, >1.0 = brighter
vec3 applyBrightness(vec3 color, float u_brightness) {
    return color * u_brightness;
}

// 2. SATURATION
// u_saturation: 0.0 = grayscale, 1.0 = normal, >1.0 = vibrant
vec3 applySaturation(vec3 color, float u_saturation) {
    // Rec. 709 luminance weights for human vision perception
    const vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);
    float luminance = dot(color, luminanceWeights);
    return mix(vec3(luminance), color, u_saturation);
}

// 3. CONTRAST
// u_contrast: 0.0 = flat gray, 1.0 = normal, >1.0 = high contrast
vec3 applyContrast(vec3 color, float u_contrast) {
    const vec3 midGray = vec3(0.5);
    return mix(midGray, color, u_contrast);
}

`;

export const __glsl_chunks_common__ = /* glsl */ `

bool isPerspectiveMatrix( mat4 m ) {

	return m[ 2 ][ 3 ] == - 1.0;

}

`;

export const __glsl_chunks_noise__ = /* glsl */ `
  // 2D Hash function
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  // Simplex-like Perlin 2D noise
  float perlinNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Fractional Brownian Motion (FBM) with 5 octaves
  float fbm(vec2 uv) {
    float total = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);

    for (int i = 0; i < 5; i++) {
      total += amplitude * perlinNoise(uv * frequency);
      uv = rot * uv;
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return total;
  }
`;
