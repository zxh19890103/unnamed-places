uniform sampler2D map;

uniform vec3 ambLightColor;
uniform float ambLightIntensity;
uniform vec3 dirLightColor;
uniform float dirLightIntensity;
uniform vec3 dirLightDir;

varying vec2 vUv;
varying vec3 vViewPosition;

void main() {
    vec4 color = texture2D(map, vUv);

    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);

    vec3 realNormal = normalize(cross(fdx, fdy));
    float diffuse = max(dot(realNormal, dirLightDir), 0.0);

    vec3 lighting = ambLightColor.rgb * ambLightIntensity + (dirLightColor.rgb * diffuse) * dirLightIntensity;

    gl_FragColor = vec4(color.rgb * lighting, 1.0);
}