import type { ThreeSetup } from "@/geo/setup.js";
import type { DemInformation } from "@/geo/tile.js";
import * as THREE from "three";

export class Clouds extends THREE.Group {
  constructor(
    textLoader: THREE.TextureLoader,
    coverage: THREE.Vector3,
    size: THREE.Vector2,
    demInfo: DemInformation
  ) {
    super();

    const texture = textLoader.load(
      "/public/assets/Gemini_Generated_Image_tzna9wtzna9wtzna.png"
    );

    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;

    const fog = new THREE.Fog(0xffffff, -100, 10000);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        fogColor: { value: fog.color },
        fogNear: { value: fog.near },
        fogFar: { value: fog.far },
        uSize: { value: size },
      },
      vertexShader: /*glsl */ `
        uniform vec2 uSize;
        attribute vec2 aCloud;

        varying vec2 vUv;
        varying vec2 vCloud;

        void main() {
            vec3 vPosition = position;
            vec4 mvPosition = modelViewMatrix * vec4(vPosition, 1.0);

            vCloud = aCloud;

            gl_PointSize = aCloud.r * uSize.x * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;

        }
      `,
      fragmentShader: /*glsl */ `
      	uniform sampler2D map;

        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;

        varying vec2 vCloud;

        vec2 getUVOffset(vec2 pointCoord, vec2 N, float index) {
            // 1. Calculate column and row (0-indexed)
            float col = mod(index, N.x);
            float row = floor(index / N.y);

            // 2. Scale the 0-1 point coordinate down to the size of a single tile
            vec2 scaledUV = pointCoord / N;

            // 3. Calculate the offset based on the grid position
            // We invert the Y (row) calculation because UV (0,0) is bottom-left, 
            // but texture atlases are usually read top-to-bottom.
            float offsetX = col / N.x;
            float offsetY = (N.y - 1.0 - row) / N.y; 

            return scaledUV + vec2(offsetX, offsetY);
        }        

        void main() {
            vec2 uv = getUVOffset(gl_PointCoord, vec2(7.0), vCloud.y);

            vec4 color = texture2D(map, uv);

            float wMask = smoothstep(0.04, 0.5, color.r);

            float depth = gl_FragCoord.z / gl_FragCoord.w;
            float fogFactor = smoothstep( fogNear, fogFar, depth );
            float varW = pow( gl_FragCoord.z, 20.0 );
            
            vec4 finalColor = mix( color, vec4(fogColor, varW ), fogFactor);

            gl_FragColor = vec4(finalColor.rgb, finalColor.a * wMask);
        }
      `,
      depthTest: false,
      transparent: true,
    });

    const n = 300;

    const geom = new THREE.BufferGeometry();
    const pts = new Float32Array(n * 3);
    const aClouds = new Float32Array(n * 2);

    let i = 0;
    let i0 = 0;

    const loc = new THREE.Vector2();

    for (; i < n; i++) {
      i0 = i * 3;

      loc.x = gaussianRandom(0, coverage.x / 4);
      loc.y = gaussianRandom(0, coverage.y / 4);

      const r = loc.length();

      pts[i0] = loc.x;
      const mean = Math.max(500, 5000 - r) / 5000;
      pts[i0 + 1] = gaussianRandom(mean * 3000, coverage.z / 5);
      pts[i0 + 2] = loc.y;

      aClouds[2 * i] = Math.max(0.52, 5.2 * Math.random());
      aClouds[2 * i + 1] = i;
    }

    geom.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    geom.setAttribute("aCloud", new THREE.BufferAttribute(aClouds, 2));

    const points = new THREE.Points(geom, material);
    this.position.set(0, demInfo.elevation.minElevation + 30, 0);
    this.add(points);
  }
}

function gaussianRandom(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

export class LonelyClouds extends THREE.Group {
  constructor(
    tileSize: THREE.Vector2,
    threeSetup: ThreeSetup,
    demInf: DemInformation
  ) {
    super();

    threeSetup.textureLoader
      .loadAsync("/steal/data-vecteezy/clouds/89")
      .then((texture) => {
        const cloud0 = new THREE.Mesh(
          new THREE.PlaneGeometry(tileSize.x, tileSize.y / 2),
          new THREE.MeshBasicMaterial({
            transparent: true,
            map: texture,
          })
        );

        cloud0.position.set(
          0,
          demInf.elevation.minElevation + tileSize.y / 4,
          -tileSize.x / 2
        );

        const ratio = texture.width / texture.height;

        cloud0.scale.x = ratio;
        cloud0.scale.multiplyScalar(0.5);

        this.add(cloud0);
      });
  }
}
