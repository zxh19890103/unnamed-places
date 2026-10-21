import * as THREE from 'three';
import { DemAtlas } from './_demAtlas';
import { SolarUniforms } from './_solar.js';
import { __glsl_chunks_common__, __glsl_chunks_noise__ } from './_glsl';

export interface CloudLayerOptions {
  /** Size (width & length in meters) of the cloud plane */
  sizeMeters?: number;
  /** Base altitude relative to demMedian (in meters) */
  altitudeMeters?: number;
  /** Vertical 3D displacement swell height (in meters). Default 400m */
  displacementMeters?: number;
  /** Radius of the spherical cap dome (in meters). Default 75,000m */
  sphereRadiusMeters?: number;
  /** UV frequency scale. Default 5.0 (smaller = wider clouds, larger = denser mist) */
  uvScale?: number;
  /** Overall opacity of the cloud sheet [0.0, 1.0] */
  opacity?: number;
  /** Cloud coverage/density [0.0, 1.0]. Higher = thicker clouds */
  coverage?: number;
  /** Wind direction and speed in meters/sec */
  windSpeed?: THREE.Vector2;
  /** Sun direction for silver-lining forward scattering */
  sunDirection?: THREE.Vector3;
  /** Cloud tint color (facing sun) */
  cloudColor?: THREE.Color;
  /** Shadow tint color (ambient underside) */
  cloudShadowColor?: THREE.Color;
}

/**
 * Cloud Shadow Uniforms
 * Shared between cloud layers and terrain tiles to project analytical cloud shadows.
 */
export const CloudShadowUniforms = {
  cloudAltitude: { value: 1300.0 }, // Base altitude matching mid-cumulus layer
  cloudCoverage: { value: 0.52 },
  cloudUvScale: { value: 4.5 },
  cloudWind: { value: new THREE.Vector2(1.2, 0.5) },
  cloudWorldSize: { value: 45_000.0 }, // Effective size for mid-cumulus plane (baseSize * 1.8)
  cloudShadowDarkness: { value: 0.98 }, // Sunlight attenuation under cloud shadow
  uCloudTime: { value: 0 }, // Single time reference shared across all tiles and clouds
};

const cloudVertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>

  uniform float uTime;
  uniform vec2 uWind;
  uniform float uAltitude;
  uniform float uDisplacement;
  uniform float uSphereRadius;
  uniform float uUvScale;
  uniform float uHasDem;
  uniform sampler2D demAtlas;
  uniform float demMedian;

  attribute vec2 demUv;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vTerrainElevation;
  varying float vCameraDist;
  varying float vPuffHeight;
  varying float vDensity;

  ${__glsl_chunks_noise__}
  ${__glsl_chunks_common__}

  void main() {
    vUv = uv;

    // 1. Dual-layer animated UV coordinates matching fragment shader wind drift
    vec2 windOffset1 = uWind * uTime * 0.00035;
    vec2 windOffset2 = vec2(-uWind.y, uWind.x) * uTime * 0.0002;

    vec2 uv1 = uv * uUvScale + windOffset1;
    vec2 uv2 = uv * (uUvScale * 2.0) + windOffset2;

    // 2. Sample FBM noise to calculate 3D puffy volume displacement
    float n1 = fbm(uv1);
    float n2 = fbm(uv2 + n1 * 0.7);
    float density = (n1 * 0.65 + n2 * 0.35) * 0.5 + 0.5;
    vDensity = density;

    // Puffs swell upwards into 3D rolling mounds where cloud density is highest
    float puffFactor = smoothstep(0.2, 0.85, density);
    float verticalDisplacement = pow(puffFactor, 1.3) * uDisplacement;
    vPuffHeight = puffFactor;

    // 3. Spherical Cap curvature drop towards horizon:
    // Models the Earth's celestial curvature so the cloud dome arcs downwards
    // towards the distant horizon, closing the gap seamlessly with the horizon fog.
    float r2 = position.x * position.x + position.z * position.z;
    float curvatureDrop = uSphereRadius - sqrt(max(0.0, uSphereRadius * uSphereRadius - r2));

    // 4. Displace vertices vertically in Y:
    // Base altitude - spherical horizon curvature drop + 3D puffy swelling
    vec3 pos = position;
    pos.y += uAltitude - curvatureDrop + verticalDisplacement;

    vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos4.xyz;

    // Sample DEM elevation at this vertex if DEM is bound
    if (uHasDem > 0.5) {
      vec2 clampedDemUv = clamp(demUv, 0.0, 1.0);
      float elev = texture2D(demAtlas, clampedDemUv).r;
      vTerrainElevation = elev - demMedian;
    } else {
      vTerrainElevation = -99999.0;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vCameraDist = length(mvPosition.xyz);

    gl_Position = projectionMatrix * mvPosition;

    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const cloudFragmentShader = /* glsl */ `
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>

  uniform float uTime;
  uniform vec2 uWind;
  uniform vec3 uSunDirection;
  uniform vec3 uCloudColor;
  uniform vec3 uCloudShadowColor;
  uniform float uOpacity;
  uniform float uCoverage;
  uniform float uAltitude;
  uniform float uUvScale;
  uniform float uSoftDepthDistance;
  uniform float uHasDem;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vTerrainElevation;
  varying float vCameraDist;
  varying float vPuffHeight;
  varying float vDensity;

  ${__glsl_chunks_noise__}

  void main() {
    #include <logdepthbuf_fragment>

    // 1. Dual-layer micro-detail for fine fluffy edges
    vec2 windOffset1 = uWind * uTime * 0.0035;
    vec2 microUv = vUv * (uUvScale * 3.0) + windOffset1 * 1.5;
    float microNoise = perlinNoise(microUv) * 0.92;

    float density = clamp(vDensity + microNoise, 0.0, 1.0);

    // Apply cloud coverage curve
    float threshold = 1.0 - uCoverage;
    float cloudAlpha = smoothstep(threshold - 0.15, threshold + 0.25, density);

    // Fade edges of the world-sized plane so it doesn't have hard boundary cuts
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edgeFade = smoothstep(0.0, 0.15, edgeDist);
    cloudAlpha *= edgeFade;

    // 2. Soft Terrain Intersection:
    // If the mountain height exceeds the cloud altitude, fade out smoothly
    if (uHasDem > 0.5) {
      float heightDiff = vWorldPos.y - vTerrainElevation;
      float softIntersection = smoothstep(-15.0, uSoftDepthDistance, heightDiff);
      cloudAlpha *= softIntersection;
    }

    if (cloudAlpha <= 0.01) {
      discard;
    }

    // 3. Volumetric Shading & Atmospheric Sun Phase Lighting:
    // Tops of 3D cloud mounds catch bright direct sunlight, valleys are in soft shadow
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 sunDir = normalize(uSunDirection);

    // Forward scattering towards sun (silver lining)
    float cosTheta = dot(viewDir, sunDir);
    float forwardScatter = pow(max(0.0, cosTheta), 3.0) * 0.5;

    // Vertical top illumination from 3D puff height
    float heightLighting = mix(0.4, 1.05, vPuffHeight);
    float lighting = heightLighting + forwardScatter;

    vec3 cloudCol = mix(uCloudShadowColor, uCloudColor, clamp(lighting, 0.0, 1.0));

    gl_FragColor = vec4(cloudCol, cloudAlpha * uOpacity);

    #include <fog_fragment>
  }
`;

export class CloudLayer extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  private _demAtlas: DemAtlas | null = null;

  constructor(options: CloudLayerOptions = {}) {
    const size = options.sizeMeters ?? 25_000;
    const segments = 96; // Dense vertex grid so 3D rolling mounds swell smoothly

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2); // Lay horizontal in XZ plane

    // Pre-initialize demUv attribute so shader attribute binding is valid immediately
    const vertexCount = (segments + 1) * (segments + 1);
    geometry.setAttribute('demUv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));

    const cloudColor = options.cloudColor ?? new THREE.Color(0xffffff);
    const shadowColor = options.cloudShadowColor ?? new THREE.Color(0x9cb5cc);

    // 1x1 default DataTexture placeholder so sampler2D is never null
    const dummyTexture = new THREE.DataTexture(
      new Float32Array([0]),
      1,
      1,
      THREE.RedFormat,
      THREE.FloatType,
    );
    dummyTexture.needsUpdate = true;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide,
      fog: true,
      uniforms: {
        ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
        ...SolarUniforms,
        uTime: { value: 0 },
        uWind: { value: options.windSpeed ?? new THREE.Vector2(1.2, 0.6) },
        ...(options.sunDirection ? { uSunDirection: { value: options.sunDirection } } : {}),
        uCloudColor: { value: cloudColor },
        uCloudShadowColor: { value: shadowColor },
        uOpacity: { value: options.opacity ?? 0.85 },
        uCoverage: { value: options.coverage ?? 0.55 },
        uAltitude: { value: options.altitudeMeters ?? 1000.0 }, // Base altitude relative to demMedian
        uDisplacement: { value: options.displacementMeters ?? 400.0 }, // 3D puffy vertical height
        uSphereRadius: { value: options.sphereRadiusMeters ?? 75_000.0 }, // Celestial curvature dome radius
        uUvScale: { value: options.uvScale ?? 5.0 },
        uSoftDepthDistance: { value: 80.0 }, // Distance in meters over which cloud fades into mountain slopes
        uHasDem: { value: 0.0 },
        demAtlas: { value: dummyTexture },
        demMedian: { value: 0.0 },
      },
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
    });

    super(geometry, material);
    this.name = 'cloud-layer';
  }

  /**
   * Bind the terrain DemAtlas so clouds can sample mountain elevations and softly blend around slopes.
   */
  bindDemAtlas(demAtlas: DemAtlas, worldCenterLatlng: { lat: number; lng: number }): void {
    this._demAtlas = demAtlas;
    const mat = this.material;
    mat.uniforms.demAtlas.value = demAtlas.texture;
    mat.uniforms.demMedian.value = demAtlas.demMedian;
    mat.uniforms.uHasDem.value = 1.0;

    // Generate demUv attributes for each vertex on the plane
    const posAttr = this.geometry.attributes.position;
    const vertexCount = posAttr.count;
    const demUvArray = new Float32Array(vertexCount * 2);

    for (let i = 0; i < vertexCount; i += 1) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const uv = demAtlas.getDemUvFromOffset(vx, vz, worldCenterLatlng);
      demUvArray[i * 2 + 0] = uv.u;
      demUvArray[i * 2 + 1] = uv.v;
    }

    this.geometry.setAttribute('demUv', new THREE.BufferAttribute(demUvArray, 2));
    this.geometry.attributes.demUv.needsUpdate = true;
  }

  /**
   * Advance cloud turbulence and wind motion in the animation loop.
   */
  update(deltaTime: number): void {
    this.material.uniforms.uTime.value += deltaTime;
    if (this._demAtlas) {
      this.material.uniforms.demMedian.value = this._demAtlas.demMedian;
      this.material.uniforms.demAtlas.value = this._demAtlas.texture;
    }
  }

  setAltitude(altitudeMeters: number): void {
    this.material.uniforms.uAltitude.value = altitudeMeters;
  }

  setDisplacement(displacementMeters: number): void {
    this.material.uniforms.uDisplacement.value = Math.max(0.0, displacementMeters);
  }

  setSphereRadius(radiusMeters: number): void {
    this.material.uniforms.uSphereRadius.value = Math.max(10_000.0, radiusMeters);
  }

  setCoverage(coverage: number): void {
    this.material.uniforms.uCoverage.value = Math.max(0.0, Math.min(1.0, coverage));
  }

  setOpacity(opacity: number): void {
    this.material.uniforms.uOpacity.value = Math.max(0.0, Math.min(1.0, opacity));
  }

  setSunDirection(sunDir: THREE.Vector3): void {
    this.material.uniforms.uSunDirection.value.copy(sunDir).normalize();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export interface CloudSystemOptions {
  /** Base world size (in meters) */
  sizeMeters?: number;
  demAtlas?: DemAtlas;
  worldCenterLatlng?: { lat: number; lng: number };
}

/**
 * Multi-layer atmospheric cloud system consisting of 3 distinct altitude strata:
 * 1. Valley Mist (谷雾 / 低空云海): Sits in deep river gorges and hugs mountain slopes.
 * 2. Mid Cumulus (中层积云): Billowy 3D mounds weaving through mountain peaks.
 * 3. High Cirrus (高空卷云): Translucent wisps drifting along the upper jet stream.
 */
export class CloudSystem extends THREE.Group {
  // readonly valleyLayer: CloudLayer;
  readonly cumulusLayer: CloudLayer;
  // readonly cirrusLayer: CloudLayer;

  constructor(options: CloudSystemOptions = {}) {
    super();
    this.name = 'cloud-system';

    const baseSize = options.sizeMeters ?? 25_000;

    // 1. Low Valley Mist (云海 / 谷雾) - Sits in the river gorge below mountain peaks
    // this.valleyLayer = new CloudLayer({
    //   sizeMeters: baseSize * 1.3,
    //   altitudeMeters: 450,
    //   displacementMeters: 180,
    //   sphereRadiusMeters: 65_000,
    //   uvScale: 10.5,
    //   coverage: 0.6,
    //   opacity: 0.75,
    //   windSpeed: new THREE.Vector2(0.4, 0.2), // Slow creeping valley drift
    //   cloudColor: new THREE.Color(0xf0f6fa),
    //   cloudShadowColor: new THREE.Color(0x8aa0b4),
    // });
    // this.valleyLayer.renderOrder = 1;

    // 2. Main Mid Cumulus Swell (中层积云) - Rolling 3D cloud masses brushing ridges
    this.cumulusLayer = new CloudLayer({
      sizeMeters: baseSize * 1.8,
      altitudeMeters: 1300,
      displacementMeters: 450,
      sphereRadiusMeters: 40_000,
      uvScale: 5.5,
      coverage: 0.66,
      opacity: 0.35,
      windSpeed: new THREE.Vector2(1.2, 0.5), // Medium wind drift
      cloudColor: new THREE.Color(0xffffff),
      cloudShadowColor: new THREE.Color(0x94acc4),
    });
    this.cumulusLayer.renderOrder = 2;

    this.add(this.cumulusLayer);

    if (options.demAtlas && options.worldCenterLatlng) {
      this.bindDemAtlas(options.demAtlas, options.worldCenterLatlng);
    }
  }

  bindDemAtlas(demAtlas: DemAtlas, worldCenterLatlng: { lat: number; lng: number }): void {
    this.cumulusLayer.bindDemAtlas(demAtlas, worldCenterLatlng);
  }

  update(deltaTime: number): void {
    CloudShadowUniforms.uCloudTime.value += deltaTime;
    this.cumulusLayer.update(deltaTime);
  }

  setSunDirection(sunDir: THREE.Vector3): void {
    this.cumulusLayer.setSunDirection(sunDir);
  }

  dispose(): void {
    this.cumulusLayer.dispose();
    this.clear();
  }
}
