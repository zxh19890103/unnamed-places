import * as THREE from 'three';

type SKyOptions = {
  DAYTIME: string;
  r: number;
};

export class Sky extends THREE.Mesh<THREE.SphereGeometry, SkyMaterial> {
  constructor({ DAYTIME, r }: SKyOptions) {
    super(new THREE.SphereGeometry(r, 64, 64), new SkyMaterial(r));

    const { elevation, azimuth } = parseDaytime(DAYTIME);
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);

    const sun = new THREE.Vector3();
    sun.setFromSphericalCoords(1, phi, theta);

    const skyUniforms = this.material.uniforms;

    skyUniforms['turbidity'].value = 2;
    skyUniforms['rayleigh'].value = 3.5;
    skyUniforms['mieCoefficient'].value = 0.002;
    skyUniforms['mieDirectionalG'].value = 0.8;
    skyUniforms['sunPosition'].value.copy(sun);
  }

  update(time: number) {
    this.material.uniforms.uTime.value = time;
  }
}

class SkyMaterial extends THREE.ShaderMaterial {
  constructor(r: number = 1) {
    super({
      side: THREE.BackSide,
      wireframe: false,
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

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);

          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));

          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            value += amp * noise(p);
            p = p * 2.0 + 12.0;
            amp *= 0.5;
          }
          return value;
        }

        void main() {
          if (vAlt < -0.1) discard;

          float azimuth = atan(vPos.z, vPos.x);
          float altitude = asin(vPos.y / length(vPos));

          vec2 cloudUv = vec2(abs(azimuth /  6.2831853), altitude * 0.7 + 0.5);
          float cloudNoise = fbm(cloudUv * vec2(6.0, 3.0));

          float skyFactor = smoothstep(-0.1, cloudNoise * 0.67, vAlt);
          vec3 sky = mix(color2, mix(color0, color1, skyFactor), smoothstep(0.0, 0.1, skyFactor));

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      uniforms: {
        radius: { value: r },
        turbidity: { value: 2 },
        rayleigh: { value: 3.5 },
        mieCoefficient: { value: 0.002 },
        mieDirectionalG: { value: 0.8 },
        uTime: { value: 0 },
        color2: { value: new THREE.Color('#1a3b5a').convertLinearToSRGB() },
        color0: { value: new THREE.Color('#edf7ff').convertLinearToSRGB() },
        color1: { value: new THREE.Color('#7ab6ea').convertLinearToSRGB() },
        sunPosition: { value: new THREE.Vector3() },
      },
    });
  }
}

function parseDaytime(timeStr: string): { elevation: number; azimuth: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const decimalHours = hours + minutes / 60;
  const solarNoon = 12;
  const hoursFromNoon = decimalHours - solarNoon;
  const maxElevation = 70;
  const elevation = Math.max(0, maxElevation - Math.abs(hoursFromNoon) * 9);
  const azimuth = 180 + hoursFromNoon * 15;
  return { elevation, azimuth };
}
