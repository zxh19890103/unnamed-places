import * as THREE from 'three';

const quadVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const seedInitFragmentShader = /* glsl */ `
  uniform sampler2D uBinaryMask;
  uniform vec2 uTexelSize;
  varying vec2 vUv;

  void main() {
    // Treat edge pixels along zone boundary as outside
    if (vUv.x <= uTexelSize.x || vUv.x >= 1.0 - uTexelSize.x ||
        vUv.y <= uTexelSize.y || vUv.y >= 1.0 - uTexelSize.y) {
      gl_FragColor = vec4(-1.0, -1.0, 0.0, 1.0);
      return;
    }

    float center = texture2D(uBinaryMask, vUv).r;
    if (center < 0.08) {
      gl_FragColor = vec4(-1.0, -1.0, 0.0, 1.0);
      return;
    }

    // 4-neighborhood check: any outside neighbor makes this an interior boundary seed
    float right = texture2D(uBinaryMask, vUv + vec2(uTexelSize.x, 0.0)).r;
    float left  = texture2D(uBinaryMask, vUv - vec2(uTexelSize.x, 0.0)).r;
    float up    = texture2D(uBinaryMask, vUv + vec2(0.0, uTexelSize.y)).r;
    float down  = texture2D(uBinaryMask, vUv - vec2(0.0, uTexelSize.y)).r;

    if (right < 0.08 || left < 0.08 || up < 0.08 || down < 0.08) {
      gl_FragColor = vec4(vUv, 0.0, 1.0);
    } else {
      gl_FragColor = vec4(-1.0, -1.0, 0.0, 1.0);
    }
  }
`;

const jfaStepFragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uTexelSize;
  uniform vec2 uAtlasSize;
  uniform float uStep;
  varying vec2 vUv;

  void main() {
    vec2 bestSeed = vec2(-1.0);
    float minDistanceSq = 1e12;

    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 sampleUv = vUv + vec2(float(dx), float(dy)) * uStep * uTexelSize;
        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
          continue;
        }

        vec2 seed = texture2D(uTexture, sampleUv).rg;
        if (seed.x >= 0.0) {
          vec2 diff = (seed - vUv) * uAtlasSize;
          float d2 = dot(diff, diff);
          if (d2 < minDistanceSq) {
            minDistanceSq = d2;
            bestSeed = seed;
          }
        }
      }
    }

    gl_FragColor = vec4(bestSeed, 0.0, 1.0);
  }
`;

const distanceFragmentShader = /* glsl */ `
  uniform sampler2D uJfaTexture;
  uniform sampler2D uBinaryMask;
  uniform vec2 uAtlasSize;
  uniform float uMetersPerTexel;
  varying vec2 vUv;

  void main() {
    vec2 seedUv = texture2D(uJfaTexture, vUv).rg;
    float mask = texture2D(uBinaryMask, vUv).r;
    bool isInside = mask >= 0.08;

    if (seedUv.x < 0.0) {
      // Unreached pixel beyond narrow-band JFA radius:
      // Negative inside road, positive outside
      float fallbackDist = isInside ? -9999.0 : 9999.0;
      gl_FragColor = vec4(fallbackDist, 0.0, 0.0, 1.0);
      return;
    }

    vec2 delta = (vUv - seedUv) * uAtlasSize;
    float distPixels = length(delta);
    float distMeters = distPixels * uMetersPerTexel;

    // Negative inside roads, positive outside
    float signedDist = isInside ? -distMeters : distMeters;

    gl_FragColor = vec4(signedDist, 0.0, 0.0, 1.0);
  }
`;

export interface OSMSdfGeneratorOptions {
  width: number;
  height: number;
  metersPerTexel: number;
  rounds?: number;
}

export class OSMSdfGenerator {
  readonly width: number;
  readonly height: number;
  readonly metersPerTexel: number;
  readonly steps: number[];

  private readonly rtA: THREE.WebGLRenderTarget;
  private readonly rtB: THREE.WebGLRenderTarget;
  private readonly rtDistance: THREE.WebGLRenderTarget;

  private readonly camera: THREE.OrthographicCamera;
  private readonly quadScene: THREE.Scene;
  private readonly quadMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  private readonly seedInitMaterial: THREE.ShaderMaterial;
  private readonly jfaStepMaterial: THREE.ShaderMaterial;
  private readonly distanceMaterial: THREE.ShaderMaterial;

  private readonly readBuffer: Float32Array;
  private isDisposed = false;

  constructor({ width, height, metersPerTexel, rounds = 4 }: OSMSdfGeneratorOptions) {
    this.width = width;
    this.height = height;
    this.metersPerTexel = metersPerTexel;

    if (rounds === 3) {
      this.steps = [4, 2, 1];
    } else {
      this.steps = [8, 4, 2, 1];
    }

    const rtOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.rtA = new THREE.WebGLRenderTarget(width, height, rtOptions);
    this.rtB = new THREE.WebGLRenderTarget(width, height, rtOptions);
    this.rtDistance = new THREE.WebGLRenderTarget(width, height, rtOptions);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();

    const texelSize = new THREE.Vector2(1.0 / width, 1.0 / height);
    const atlasSize = new THREE.Vector2(width, height);

    this.seedInitMaterial = new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader: seedInitFragmentShader,
      uniforms: {
        uBinaryMask: { value: null },
        uTexelSize: { value: texelSize },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.jfaStepMaterial = new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader: jfaStepFragmentShader,
      uniforms: {
        uTexture: { value: null },
        uTexelSize: { value: texelSize },
        uAtlasSize: { value: atlasSize },
        uStep: { value: 1.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.distanceMaterial = new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader: distanceFragmentShader,
      uniforms: {
        uJfaTexture: { value: null },
        uBinaryMask: { value: null },
        uAtlasSize: { value: atlasSize },
        uMetersPerTexel: { value: metersPerTexel },
      },
      depthTest: false,
      depthWrite: false,
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(quadGeo, this.seedInitMaterial);
    this.quadScene.add(this.quadMesh);

    this.readBuffer = new Float32Array(width * height * 4);
  }

  /**
   * Execute WebGL JFA pipeline and copy signed distance values into target Float32Array.
   */
  computeSdf(
    renderer: THREE.WebGLRenderer,
    binaryMaskTexture: THREE.Texture,
    targetSdfData: Float32Array,
  ): void {
    if (this.isDisposed) return;

    const prevRenderTarget = renderer.getRenderTarget();

    // 1. Seed Initialization Pass -> rtA
    this.seedInitMaterial.uniforms.uBinaryMask.value = binaryMaskTexture;
    this.quadMesh.material = this.seedInitMaterial;
    renderer.setRenderTarget(this.rtA);
    renderer.render(this.quadScene, this.camera);

    // 2. Jump Flooding Ping-Pong rounds
    let src = this.rtA;
    let dst = this.rtB;

    for (let i = 0; i < this.steps.length; i += 1) {
      this.jfaStepMaterial.uniforms.uTexture.value = src.texture;
      this.jfaStepMaterial.uniforms.uStep.value = this.steps[i];
      this.quadMesh.material = this.jfaStepMaterial;

      renderer.setRenderTarget(dst);
      renderer.render(this.quadScene, this.camera);

      const temp = src;
      src = dst;
      dst = temp;
    }

    // 3. Final Distance & Sign Pass -> rtDistance
    this.distanceMaterial.uniforms.uJfaTexture.value = src.texture;
    this.distanceMaterial.uniforms.uBinaryMask.value = binaryMaskTexture;
    this.quadMesh.material = this.distanceMaterial;
    renderer.setRenderTarget(this.rtDistance);
    renderer.render(this.quadScene, this.camera);

    // 4. Read back float pixels and write to single-channel target array
    renderer.readRenderTargetPixels(
      this.rtDistance,
      0,
      0,
      this.width,
      this.height,
      this.readBuffer,
    );

    const totalPixels = this.width * this.height;
    for (let i = 0; i < totalPixels; i += 1) {
      targetSdfData[i] = this.readBuffer[i * 4];
    }

    renderer.setRenderTarget(prevRenderTarget);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.rtA.dispose();
    this.rtB.dispose();
    this.rtDistance.dispose();

    this.quadMesh.geometry.dispose();
    this.seedInitMaterial.dispose();
    this.jfaStepMaterial.dispose();
    this.distanceMaterial.dispose();
  }
}
