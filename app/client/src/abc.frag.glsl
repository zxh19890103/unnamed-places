uniform sampler2D map;
varying vec2 vUv;

#include <chunk_glsl_test>

void main() {
    vec3 color = itsatest(); // texture2D(map, vUv);
    gl_FragColor = vec4(color.rgb, 1.0);
}