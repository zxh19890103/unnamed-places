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

uniform vec3 ambientLightColor;

#if NUM_DIR_LIGHTS > 0
struct DirectionalLight {
  vec3 direction;
  vec3 color;
};
uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
#endif

// Color ramp based on slope and aspect
vec3 colorRamp(float slope, float aspect) {
  // Low slope = greenish, high slope = reddish, with aspect affecting hue
  float slopeNorm = clamp(slope / 90.0, 0.0, 1.0);
  
  // Base color from slope (green to brown)
  vec3 lowSlopeColor = vec3(0.2, 0.6, 0.3); // #4CAF50
  vec3 highSlopeColor = vec3(0.7, 0.4, 0.2); // #B26A4C
  vec3 baseColor = mix(lowSlopeColor, highSlopeColor, slopeNorm);
  
  // Aspect-based modulation (NE-facing tends to be lighter)
  float sinAspect = sin(aspect - 0.785398); // -45° (NW bias)
  float cosAspect = cos(aspect - 0.785398);
  
  vec3 aspectBias = vec3(
    mix(0.8, 1.2, sinAspect * 0.5 + 0.5),
    mix(0.9, 1.0, cosAspect * 0.5 + 0.5),
    1.0
  );
  
  return baseColor * aspectBias * uColorRampScale;
}

vec3 calcTerrainNormalView(float slope, float aspect) {
  float slopeRad = slope * 3.14159 / 180.0;
  float aspectRad = aspect;
  vec3 terrainNormalLocal = vec3(
    sin(slopeRad) * cos(aspectRad),
    sin(slopeRad) * sin(aspectRad),
    cos(slopeRad)
  );

  vec3 upWorld = normalize(vWorldPos);
  vec3 eastWorld = cross(vec3(0.0, 1.0, 0.0), upWorld);
  if (length(eastWorld) < 0.0001) {
    eastWorld = cross(vec3(0.0, 0.0, 1.0), upWorld);
  }
  eastWorld = normalize(eastWorld);

  // The derivatives route encodes aspect from raster x/y, where +y points south.
  vec3 southWorld = -normalize(cross(upWorld, eastWorld));
  vec3 normalWorld = normalize(
    eastWorld * terrainNormalLocal.x +
    southWorld * terrainNormalLocal.y +
    upWorld * terrainNormalLocal.z
  );

  vec3 normalView = normalize(mat3(viewMatrix) * normalWorld);

  vec3 viewDir = normalize(-vViewPos);
  if (dot(normalView, viewDir) < 0.0) {
    normalView = -normalView;
  }

  return normalView;
}

vec3 applyDirectionalLighting(vec3 baseColor, vec3 normalView) {
  vec3 lightColor = ambientLightColor;

  #if NUM_DIR_LIGHTS > 0
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      float ndl = max(dot(normalView, directionalLights[i].direction), 0.0);
      lightColor += ndl * directionalLights[i].color;
    }
  #endif

  return baseColor * max(lightColor, vec3(0.2));
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

  vec3 baseColor = colorRamp(slope, aspect);
  vec3 normalView = calcTerrainNormalView(slope, aspect);
  vec3 color = applyDirectionalLighting(baseColor, normalView);

  gl_FragColor = vec4(color, 1.0);
  
  #include <fog_fragment>
}
