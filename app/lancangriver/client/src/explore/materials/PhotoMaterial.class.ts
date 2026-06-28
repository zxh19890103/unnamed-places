import * as THREE from "three";

type Parameters = {
  color?: THREE.ColorRepresentation;
};

export class PhotoMaterial extends THREE.ShaderMaterial {
  constructor(params: Parameters = {}) {
    const { color = "#ffffff" } = params;

    super({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          gl_FragColor = vec4(uColor, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });
  }
}
