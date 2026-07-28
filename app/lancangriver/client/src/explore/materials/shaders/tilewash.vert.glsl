varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPositionW;

void main() {
  vUv = uv;
  vNormalW = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vPositionW = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
