uniform sampler2D displacementMap;
uniform vec3 elevation;

varying vec2 vUv;
varying vec3 vViewPosition;

void main() {
    vec3 pos = position.xyz;

    float h = texture2D(displacementMap, uv).r;
    pos.z += elevation.x + elevation.z * h;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);

    vUv = uv;
    vViewPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}