uniform sampler2D map;
varying vec2 vUv;

#include <chunk_glsl_test_pars>

void main() {
    vec4 color = texture2D(map, vUv);
    gl_FragColor = vec4(color.rgb, 1.0);
}