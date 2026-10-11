import * as THREE from 'three';
import { DEFAULT_DAYTIME, setSolarDaytime, SolarUniforms } from './_solar.js';

export type SkyOptions = {
  r: number;
  DAYTIME?: string;
};

export type SolarMeshOptions = {
  /** Celestial sphere radius */
  r: number;
  /** Relative angular size of the sun disc. Default 0.04 (approx 2.3 degrees) */
  sizeRatio?: number;
};

export class SolarMesh extends THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial> {
  constructor({ r, sizeRatio = 0.04 }: SolarMeshOptions) {
    const sunRadius = r * sizeRatio;
    const geometry = new THREE.CircleGeometry(sunRadius, 48);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...SolarUniforms,
        coreColor: { value: new THREE.Color('#ffffff') },
        coronaColor: { value: new THREE.Color('#ffe188') },
        flareColor: { value: new THREE.Color('#ff8822') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 coreColor;
        uniform vec3 coronaColor;
        uniform vec3 flareColor;
        varying vec2 vUv;

        void main() {
          vec2 center = vUv - vec2(0.5);
          float dist = length(center) * 2.0;

          if (dist > 1.0) discard;

          // 1. Intensely bright inner core disc
          float core = 1.0 - smoothstep(0.0, 0.25, dist);

          // 2. Soft golden corona
          float corona = 1.0 - smoothstep(0.15, 0.65, dist);

          // 3. Diffuse atmospheric outer flare
          float flare = pow(1.0 - smoothstep(0.35, 1.0, dist), 2.0);

          vec3 col = coreColor * (core * 1.6) + coronaColor * (corona * 0.9) + flareColor * (flare * 0.5);
          float alpha = clamp(core * 1.0 + corona * 0.8 + flare * 0.4, 0.0, 1.0);

          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    super(geometry, material);
    this.name = 'solar-mesh';

    // Set renderOrder after sky sphere (-100) and place slightly inside radius (0.985 * r) to prevent z-fighting
    this.renderOrder = -90;

    const updatePosition = () => {
      const sunDir = SolarUniforms.sunDirection.value;
      this.visible = sunDir.y > -0.08;
      const distance = r * 0.985;
      this.position.copy(sunDir).multiplyScalar(distance);
      this.lookAt(0, 0, 0);
    };

    updatePosition();
    this.onBeforeRender = updatePosition;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class Sky extends THREE.Mesh<THREE.SphereGeometry, SkyMaterial> {
  readonly solarMesh: SolarMesh;

  constructor({ DAYTIME = DEFAULT_DAYTIME, r }: SkyOptions) {
    if (DAYTIME) {
      setSolarDaytime(DAYTIME);
    }

    super(new THREE.SphereGeometry(r, 64, 64), new SkyMaterial(r));
    this.renderOrder = -100;

    const skyUniforms = this.material.uniforms;

    skyUniforms['turbidity'].value = 2;
    skyUniforms['rayleigh'].value = 3.5;
    skyUniforms['mieCoefficient'].value = 0.002;
    skyUniforms['mieDirectionalG'].value = 0.8;

    this.solarMesh = new SolarMesh({ r });
    this.add(this.solarMesh);
  }

  update(time: number) {
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.solarMesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

class SkyMaterial extends THREE.ShaderMaterial {
  constructor(r: number = 1) {
    super({
      side: THREE.BackSide,
      wireframe: false,
      depthWrite: true,
      vertexShader: /*glsl */ `
        uniform float radius;

        varying float vAlt;
        varying vec3 vPos;

        void main() {
          vPos = position;
          vAlt = position.y / radius;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /*glsl */ `
        uniform vec3 color0;
        uniform vec3 color1;
        uniform vec3 color2;
        uniform float uTime;

        varying float vAlt;
        varying vec3 vPos;

        void main() {
          if (vAlt < -0.1) discard;

          float azimuth = atan(vPos.z, vPos.x);
          float altitude = asin(vPos.y / length(vPos));

          float skyFactor = smoothstep(-0.1, 0.25, vAlt);
          vec3 sky = mix(color2, mix(color0, color1, skyFactor), smoothstep(0.0, 0.1, skyFactor));

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      uniforms: {
        ...SolarUniforms,
        radius: { value: r },
        turbidity: { value: 2 },
        rayleigh: { value: 3.5 },
        mieCoefficient: { value: 0.002 },
        mieDirectionalG: { value: 0.8 },
        uTime: { value: 0 },
        color2: { value: new THREE.Color('#ffffff').convertLinearToSRGB() },
        color0: { value: new THREE.Color('#edf7ff').convertLinearToSRGB() },
        color1: { value: new THREE.Color('#7ab6ea').convertLinearToSRGB() },
      },
    });
  }
}
