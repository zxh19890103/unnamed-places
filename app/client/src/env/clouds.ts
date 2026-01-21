import type { ThreeSetup } from "@/geo/setup.js";
import type { DemInformation } from "@/geo/tile.js";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export class Clouds extends THREE.Group {
  constructor(
    textLoader: THREE.TextureLoader,
    coverage: THREE.Vector3,
    size: THREE.Vector2,
    demInfo: DemInformation,
  ) {
    super();

    const texture = textLoader.load(
      "/public/assets/Gemini_Generated_Image_tzna9wtzna9wtzna.png",
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

export class LonelyBigClouds extends THREE.Group {
  constructor(
    tileSize: THREE.Vector2,
    threeSetup: ThreeSetup,
    demInf: DemInformation,
  ) {
    super();

    threeSetup.textureLoader
      .loadAsync("/steal/data-vecteezy/clouds/_in-one")
      .then((texture) => {
        const planeTop = new THREE.PlaneGeometry(tileSize.x, tileSize.y);
        const planeFront = new THREE.PlaneGeometry(tileSize.x, tileSize.y / 2);
        const planeBack = new THREE.PlaneGeometry(tileSize.x, tileSize.y / 2);
        const planeLeft = new THREE.PlaneGeometry(tileSize.x, tileSize.y / 2);
        const planeRight = new THREE.PlaneGeometry(tileSize.x, tileSize.y / 2);

        planeTop.rotateX(-Math.PI / 2);
        planeTop.translate(0, tileSize.y / 2, 0);

        const totalGeometry = mergeGeometries([
          planeTop,
          // planeFront,
          // planeBack,
          // planeLeft,
          // planeRight,
        ]);

        const cloud0 = new THREE.Mesh(
          totalGeometry,
          new THREE.MeshBasicMaterial({
            transparent: true,
            map: texture,
          }),
        );

        // cloud0.position.set(
        //   0,
        //   demInf.elevation.minElevation + tileSize.y / 4,
        //   -tileSize.x / 2,
        // );

        const ratio = texture.width / texture.height;

        cloud0.scale.x = ratio;
        cloud0.scale.multiplyScalar(0.5);

        this.add(cloud0);
      });
  }
}

export class SkyClouds extends THREE.Group {
  public mesh: THREE.InstancedMesh;
  private material: THREE.ShaderMaterial;

  constructor(
    cloudTexture: THREE.Texture,
    count: number,
    sizeS: number,
    elevationE: number,
  ) {
    super();

    const geometry = new THREE.PlaneGeometry(30, 30);

    // Attribute for 4x4 sprite selection
    const instanceIndices = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      instanceIndices[i] = Math.floor(Math.random() * 16);
    }
    geometry.setAttribute(
      "instanceIndex",
      new THREE.InstancedBufferAttribute(instanceIndices, 1),
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: cloudTexture },
        uGridSize: { value: 4.0 },
      },
      vertexShader: `
                attribute float instanceIndex;
                varying vec2 vUv;
                
                void main() {
                    vUv = uv;
                    float gridSize = 4.0;
                    float column = mod(instanceIndex, gridSize);
                    float row = floor(instanceIndex / gridSize);
                    vUv = (vUv / gridSize) + vec2(column / gridSize, (gridSize - 1.0 - row) / gridSize);

                    // --- BILLBOARDING LOGIC ---
                    // Extract position from the instance matrix
                    vec3 instancePosition = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                    
                    // Get the view-space position of the instance
                    vec4 mvPosition = modelViewMatrix * vec4(instancePosition, 1.0);

                    // Extract the scale from the instance matrix
                    float scaleX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
                    float scaleY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));

                    // Apply local vertex position to the view-space center (cancels rotation)
                    mvPosition.xy += position.xy * vec2(scaleX, scaleY);

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
      fragmentShader: `
                uniform sampler2D uTexture;
                varying vec2 vUv;
                void main() {
                    vec4 color = texture2D(uTexture, vUv);
                    if (color.a < 0.05) discard;
                    gl_FragColor = color;
                }
            `,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.distributeOnHorizon(sizeS, elevationE);
    this.add(this.mesh);
  }

  private distributeOnHorizon(S: number, E: number): void {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < this.mesh.count; i++) {
      // 1. Polar Distribution (Around the edge)
      const angle = Math.random() * Math.PI * 2;
      // Radius between 40% and 60% of S to form a ring at the boundary
      const radius = (1 + Math.random() * 0.2) * S;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // 2. Vertical Distribution (Above elevation E)
      // Clouds float between E + small offset and a ceiling
      const y = E + Math.random() * (S * 0.15);

      position.set(x, y, z);

      // 3. Scale & Rotation
      // Since we use billboarding in the shader, rotation in the matrix
      // is only needed if you want to rotate the sprite on its own Z-axis.
      const s = S * 0.01 + Math.random() * (S * 0.01); // Scale relative to S
      scale.set(s, s, s);

      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(i, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
