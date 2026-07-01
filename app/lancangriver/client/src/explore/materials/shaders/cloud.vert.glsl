uniform float uSize;
uniform float uSizeAttenuation;
uniform float uViewportHeight;

attribute float spriteIndex;

varying float vSpriteIndex;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  float pointSize = uSize;
  if (uSizeAttenuation > 0.5) {
    pointSize *= (uViewportHeight / max(1.0, -mvPosition.z));
  }

  vSpriteIndex = spriteIndex;
  gl_PointSize = max(1.0, pointSize);
  gl_Position = projectionMatrix * mvPosition;
}
