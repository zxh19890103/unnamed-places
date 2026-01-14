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

    vec3 texelColor = color.rgb;

    float gray = dot(texelColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 rockGrey = vec3(gray) * vec3(0.95, 0.95, 1.0);

    gl_FragColor = vec4(rockGrey * lighting, 1.0);
}