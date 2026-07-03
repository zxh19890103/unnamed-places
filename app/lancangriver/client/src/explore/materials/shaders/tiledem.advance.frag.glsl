uniform sampler2D uDerivativesTexture;
uniform float uDemReady;
uniform float uDerivativesReady;
uniform float uHillshadeEnabled;
uniform float uColorRampScale;

varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vWorldPos;
varying vec3 vNormal;

#include <fog_pars_fragment>

// Color ramp based on slope and aspect
vec3 colorRamp(float slope, float aspect) {
  // Low slope = greenish, high slope = reddish, with aspect affecting hue
  float slopeNorm = clamp(slope / 90.0, 0.0, 1.0);
  
  // Base color from slope (green to brown)
  vec3 lowSlopeColor = vec3(0.2, 0.6, 0.3);
  vec3 highSlopeColor = vec3(0.7, 0.4, 0.2);
  vec3 baseColor = mix(lowSlopeColor, highSlopeColor, slopeNorm);
  
  // Aspect-based modulation (NE-facing tends to be lighter)
  float sinAspect = sin(aspect * 2.0 * 3.14159 - 0.785398); // -45° (NW bias)
  float cosAspect = cos(aspect * 2.0 * 3.14159 - 0.785398);
  
  vec3 aspectBias = vec3(
    mix(0.8, 1.2, sinAspect * 0.5 + 0.5),
    mix(0.9, 1.0, cosAspect * 0.5 + 0.5),
    1.0
  );
  
  return baseColor * aspectBias * uColorRampScale;
}

// Hillshade using standard illumination
vec3 hillshade(float slope, float aspect) {
  // Sun altitude = 45°, azimuth = 315° (NW)
  float sunAzimuth = 315.0 * 3.14159 / 180.0;
  float sunAltitude = 45.0 * 3.14159 / 180.0;
  
  // Approximate surface normal from slope/aspect
  float slopeRad = slope * 3.14159 / 180.0;
  float aspectRad = aspect * 2.0 * 3.14159;
  
  vec3 surfaceNormal = normalize(vec3(
    sin(slopeRad) * cos(aspectRad),
    sin(slopeRad) * sin(aspectRad),
    cos(slopeRad)
  ));
  
  // Sun direction
  vec3 sunDir = vec3(
    cos(sunAltitude) * sin(sunAzimuth),
    cos(sunAltitude) * cos(sunAzimuth),
    sin(sunAltitude)
  );
  
  // Lambertian shading with ambient minimum
  float illumination = max(0.3, dot(surfaceNormal, sunDir));
  
  return vec3(illumination);
}

void main() {
  if (uDemReady < 0.5) {
    // Fallback: neutral gray
    gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
    #include <fog_fragment>
    return;
  }

  vec4 derivSample = texture2D(uDerivativesTexture, vUv);
  
  // Unpack slope and aspect from derivatives
  // R channel: slope 0..90° mapped to 0..255
  // G channel: sin(aspect) in [-1..1] mapped to 0..255
  // B channel: cos(aspect) in [-1..1] mapped to 0..255
  float slope = (derivSample.r / 255.0) * 90.0;
  float sinAspect = (derivSample.g / 255.0) * 2.0 - 1.0;
  float cosAspect = (derivSample.b / 255.0) * 2.0 - 1.0;
  
  // Recompute aspect angle from sin/cos
  float aspect = atan(sinAspect, cosAspect);
  if (aspect < 0.0) {
    aspect += 2.0 * 3.14159;
  }
  // Normalize to [0..1] for ramp
  aspect = aspect / (2.0 * 3.14159);
  
  vec3 color;
  if (uHillshadeEnabled > 0.5) {
    color = hillshade(slope, aspect);
  } else {
    color = colorRamp(slope, aspect);
  }

  gl_FragColor = vec4(color, 1.0);
  
  #include <fog_fragment>
}
