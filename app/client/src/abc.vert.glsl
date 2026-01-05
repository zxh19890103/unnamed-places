uniform sampler2D displacementMap;
uniform vec3 elevation;

varying vec2 vUv;

void main() {
    vec3 pos = position.xyz;

    float h = texture2D(displacementMap, uv).r;
    pos.z += elevation.x + elevation.z * h;

    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}