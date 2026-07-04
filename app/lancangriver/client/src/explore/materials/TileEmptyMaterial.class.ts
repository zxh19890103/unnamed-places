import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
void main() {
  vec2 cell = floor(vUv * 12.0);
  float checker = mod(cell.x + cell.y, 2.0);

  vec3 lightCell = vec3(0.84, 0.88, 0.92);
  vec3 darkCell = vec3(0.76, 0.81, 0.87);
  vec3 checkerColor = mix(lightCell, darkCell, checker);

  float vertical = smoothstep(0.0, 1.0, vUv.y);
  vec3 topTint = vec3(0.95, 0.97, 0.99);
  vec3 bottomTint = vec3(0.68, 0.73, 0.80);
  vec3 gradientColor = mix(topTint, bottomTint, vertical);

  vec3 color = mix(checkerColor, gradientColor, 0.35);
  gl_FragColor = vec4(color, 1.0);
}
`;

export class TileEmptyMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      side: THREE.BackSide,
      vertexShader,
      fragmentShader,
    });
  }
}
