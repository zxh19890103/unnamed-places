import type { ThreeSetup } from "@/geo/setup.js";
import type { DemInformation } from "@/geo/tile.js";
import * as THREE from "three";

export class Plants extends THREE.Group {
  constructor(
    tileSize: THREE.Vector2,
    greenMask: THREE.Texture,
    demInformation: DemInformation,
    threeSetup: ThreeSetup
  ) {
    super();

    const n = 500000;
    const positions = new Float32Array(n * 3);
    const uvs = new Float32Array(n * 2);
    const scales = new Float32Array(n * 4);
    let i0 = 0;

    for (let i = 0; i < n; i++) {
      const x = Math.random() * tileSize.x;
      const y = Math.random() * tileSize.y;

      i0 = 3 * i;
      positions[i0] = x;
      positions[i0 + 1] = y;

      i0 = 2 * i;
      uvs[i0] = x / tileSize.x;
      uvs[i0 + 1] = y / tileSize.y;

      i0 = 4 * i;
      scales[i0] = 0.5 + Math.random() * 2;
      scales[i0 + 1] = Math.random() * 8;
      scales[i0 + 2] = Math.random() * 8;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("aPlant", new THREE.BufferAttribute(scales, 4));

    const fog = new THREE.Fog(0x444444, 100, 10000);

    const plantsTex = threeSetup.textureLoader.load(
      "/steal/data-vecteezy/flowers/_in-one"
    );

    plantsTex.magFilter = THREE.LinearFilter;
    plantsTex.minFilter = THREE.LinearFilter;

    const ui = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          fogNear: { value: fog.near },
          fogFar: { value: fog.far },
          fogColor: { value: fog.color },
          map: {
            value: plantsTex,
          },
          greenMaskMap: {
            value: greenMask,
          },
          uSize: {
            value: 50,
          },
          displacementMap: { value: demInformation.texture },
          displacementBias: {
            value: demInformation.elevation.minElevation + 30,
          },
          displacementScale: { value: demInformation.elevation.span },
        },
        depthTest: true,
        precision: "highp",
        transparent: true,
        vertexShader: `
            attribute vec4 aPlant;

            uniform sampler2D displacementMap;
            uniform float displacementBias;
            uniform float displacementScale;
            uniform float uSize;
            uniform sampler2D greenMaskMap;

            varying vec2 vUv;
            varying vec3 vWorldPosition;

            flat out vec4 vPlant;
            varying vec3 vGreenMaskColor;

            void main() {
                vec3 ipos = position.xyz;

                float h = texture2D(displacementMap, uv).r;

                ipos.z = displacementBias + displacementScale * h;

                vec4 vPos = modelViewMatrix * vec4(ipos, 1.0);

                gl_PointSize = aPlant.r * uSize * (300.0 / -vPos.z);

                vUv = uv;
                vPlant = aPlant;
                vGreenMaskColor = texture2D(greenMaskMap, uv).rgb;

                vec4 wPos = modelMatrix * vec4(ipos, 1.0);
                vWorldPosition = wPos.xyz;

                gl_Position = projectionMatrix * vec4(vPos.xyz, 1.0);
            }
            `,
        fragmentShader: `
            uniform sampler2D map;

            uniform float fogFar;
            uniform float fogNear;
            uniform vec3 fogColor;

            varying vec3 vWorldPosition;

            varying vec2 vUv;
            varying vec3 vGreenMaskColor;
            flat in vec4 vPlant;

            void main() {
                vec2 uv = gl_PointCoord;

                uv.y = 1.0 - uv.y;
                vec2 uv_offset = 0.125 * floor(vPlant.yw);
                uv = uv_offset  +  0.125 * uv;

                vec4 baseColor = texture2D(map, uv);

                if (baseColor.a < 0.5) discard;

                vec3 targetGreen = vec3(0.13, 0.55, 0.13);

                float howfar = distance(vGreenMaskColor, targetGreen);

                float vegetationFactor = smoothstep(0.42, 0.2, howfar);

                if (vegetationFactor < 0.025) discard;

                float depth = gl_FragCoord.z / gl_FragCoord.w;
                float fogFactor = smoothstep( fogNear, fogFar, depth );

                vec3 finalRGB = mix(baseColor.rgb, vGreenMaskColor, 0.2);
                gl_FragColor = vec4(mix(finalRGB, fogColor, fogFactor), 1.0);
            }
            `,
      })
    );

    this.add(ui);
  }
}
