export const __glsl_funcs__ = `

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
