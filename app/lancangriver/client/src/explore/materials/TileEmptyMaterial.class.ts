import * as THREE from "three";

export type TileEmptyMaterialParameters = {
  neighborTint?: THREE.ColorRepresentation;
  neighborBleed?: number;
};

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;

uniform vec3 uNeighborTint;
uniform float uNeighborMix;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  // Multi-scale procedural variation to avoid flat color patches.
  float macro = fbm(vUv * 4.0 + vec2(3.1, 1.7));
  float micro = fbm(vUv * 22.0 + vec2(7.3, 4.9));
  float terrain = clamp(macro * 0.75 + micro * 0.25, 0.0, 1.0);

  // Soft biome-like tint blend (soil -> grass -> rock).
  vec3 soil = vec3(0.49, 0.42, 0.33);
  vec3 grass = vec3(0.40, 0.52, 0.37);
  vec3 rock = vec3(0.61, 0.61, 0.58);

  vec3 lowBand = mix(soil, grass, smoothstep(0.18, 0.58, terrain));
  vec3 baseColor = mix(lowBand, rock, smoothstep(0.62, 0.92, terrain));

  // Gentle north-south atmospheric tint and seam-softening near inner edge.
  float latTint = smoothstep(0.0, 1.0, vUv.y);
  vec3 haze = vec3(0.84, 0.89, 0.92);
  vec3 color = mix(baseColor, haze, 0.11 * latTint);

  // Fake directional light to keep shape readable without hard contrast.
  float light = 0.90 + 0.10 * dot(normalize(vec2(0.55, 0.83)), normalize(vec2(0.3 + terrain, 0.7 + latTint)));
  color *= light;

  // A very subtle checker trace to preserve tile identity without looking synthetic.
  vec2 cell = floor(vUv * 10.0);
  float checker = mod(cell.x + cell.y, 2.0);
  color *= mix(0.985, 1.0, checker);

  // Pull halo color toward nearby core-tile tint for smoother continuity.
  color = mix(color, uNeighborTint, clamp(uNeighborMix, 0.0, 1.0));

  gl_FragColor = vec4(color, 1.0);
}
`;

export class TileEmptyMaterial extends THREE.ShaderMaterial {
  constructor(parameters: TileEmptyMaterialParameters = {}) {
    const { neighborTint = "#708370", neighborBleed = 0.32 } = parameters;

    super({
      side: THREE.BackSide,
      uniforms: {
        uNeighborTint: { value: new THREE.Color(neighborTint) },
        uNeighborMix: { value: neighborBleed },
      },
      vertexShader,
      fragmentShader,
    });
  }
}
