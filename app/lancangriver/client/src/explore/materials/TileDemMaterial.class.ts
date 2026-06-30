import * as THREE from "three";
import { BASE_URL, ELEVATION_SCALE } from "../../calc/constants";
import { SphereTileKey } from "../../calc/types";

type Parameters = {
  tileKey: SphereTileKey;
  elevationScale?: number;
};

export class TileDemMaterial extends THREE.ShaderMaterial {
  private pendingSatelliteImage: HTMLImageElement | null = null;

  private pendingDemImage: HTMLImageElement | null = null;

  constructor(
    textureLoader: THREE.TextureLoader,
    imageLoader: THREE.ImageLoader,
    parameters: Parameters,
  ) {
    const { tileKey, elevationScale = ELEVATION_SCALE } = parameters;

    const satelliteTexture = new THREE.Texture();
    const demTexture = new THREE.Texture();

    super({
      side: THREE.BackSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uSatelliteTexture: { value: satelliteTexture },
          uDemTexture: { value: demTexture },
          uSatelliteReady: { value: 0 },
          uDemReady: { value: 0 },
          uElevationScale: { value: elevationScale },
          uDemTexelSize: { value: new THREE.Vector2(1 / 256, 1 / 256) },
          uSaturation: { value: 1.0 },
          uContrast: { value: 1.0 },
          uGamma: { value: 1.0 },
          uColor: { value: new THREE.Color(0xffffff) },
        },
      ]),
      vertexShader: `
      uniform sampler2D uDemTexture;
      uniform float uDemReady;
      uniform float uElevationScale;
      uniform vec2 uDemTexelSize;

      varying vec2 vUv;

      #include <fog_pars_vertex>

      void main() {
        vUv = uv;

        vec3 displaced = position;

        if (uDemReady > 0.5) {
          vec3 demRgb = texture2D(uDemTexture, uv).rgb * 255.0;
          float elevation = (demRgb.r * 256.0 + demRgb.g + demRgb.b / 256.0) - 32768.0;
          displaced = position + normal * (elevation * uElevationScale);
        }

        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
      }
    `,
      fragmentShader: `
      uniform sampler2D uSatelliteTexture;
      uniform float uSatelliteReady;
      uniform vec2 uDemTexelSize;

      uniform float uSaturation;
      uniform float uContrast;
      uniform float uGamma;
      uniform vec3 uColor;

      varying vec2 vUv;

      #include <fog_pars_fragment>

      vec3 applySaturation(vec3 color, float saturation) {
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        return mix(vec3(luma), color, saturation);
      }

      vec3 applyContrast(vec3 color, float contrast) {
        return clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0);
      }

      vec3 applyGamma(vec3 color, float gammaValue) {
        float safeGamma = max(gammaValue, 0.001);
        return pow(max(color, vec3(0.0)), vec3(1.0 / safeGamma));
      }

      float calcExgr(vec3 rgb) {

        float total = rgb.r + rgb.g + rgb.b + 0.000001;

        float rn = rgb.r / total;
        float gn = rgb.g / total;
        float bn = rgb.b / total;

        float exg = 2.0 * gn - rn - bn;
        float exr = 1.4 * rn - gn;
        float exgr = exg - exr;

        return exgr;
      }

      void main() {
        vec3 color = texture2D(uSatelliteTexture, vUv).rgb;

        float exgr = calcExgr(color.rgb);
        float exgr01 = clamp(exgr * 0.5 + 0.5, 0.0, 1.0);
        float exgr02 = smoothstep(0.4, 1.0, exgr01);
        vec3 blended = mix(color.rgb, vec3(0.243, 0.561, 0.294), exgr02);

        vec3 outputColor = mix(uColor, blended, uSatelliteReady);

        outputColor = applyContrast(outputColor, uContrast);
        outputColor = applySaturation(outputColor, uSaturation);
        outputColor = applyGamma(outputColor, uGamma);

        gl_FragColor = vec4(outputColor, 1.0);

        #include <fog_fragment>
      }
    `,
    });

    this.pendingSatelliteImage = imageLoader.load(
      `${BASE_URL}/raster/satellite/${tileKey.z}/${tileKey.x}/${tileKey.y}.jpeg`,
      (image) => {
        if (!this.pendingSatelliteImage) {
          return;
        }

        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          this.pendingSatelliteImage = null;
          return;
        }

        this.uniforms.uSatelliteReady.value = 1;
        satelliteTexture.image = image;
        satelliteTexture.needsUpdate = true;

        this.pendingSatelliteImage = null;
      },
      undefined,
      () => {
        this.pendingSatelliteImage = null;
      },
    );

    this.pendingDemImage = imageLoader.load(
      `${BASE_URL}/raster/dem/${tileKey.z}/${tileKey.x}/${tileKey.y}.png`,
      (image) => {
        if (!this.pendingDemImage) {
          return;
        }

        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          this.pendingDemImage = null;
          return;
        }

        this.uniforms.uDemReady.value = 1;
        // Heightmaps should use edge-clamped nearest sampling without mipmaps
        // to reduce border interpolation artifacts between adjacent tiles.
        demTexture.wrapS = THREE.ClampToEdgeWrapping;
        demTexture.wrapT = THREE.ClampToEdgeWrapping;
        demTexture.magFilter = THREE.NearestFilter;
        demTexture.minFilter = THREE.NearestFilter;
        demTexture.generateMipmaps = false;
        demTexture.image = image;
        demTexture.needsUpdate = true;

        this.pendingDemImage = null;
      },
      undefined,
      () => {
        this.pendingDemImage = null;
      },
    );
  }

  override dispose(): void {
    if (this.pendingSatelliteImage) {
      this.pendingSatelliteImage.onload = null;
      this.pendingSatelliteImage.onerror = null;
      this.pendingSatelliteImage.src = "";
      this.pendingSatelliteImage = null;
    }

    if (this.pendingDemImage) {
      this.pendingDemImage.onload = null;
      this.pendingDemImage.onerror = null;
      this.pendingDemImage.src = "";
      this.pendingDemImage = null;
    }

    const satelliteTexture = this.uniforms.uSatelliteTexture.value;
    if (satelliteTexture instanceof THREE.Texture) {
      satelliteTexture.dispose();
    }

    const demTexture = this.uniforms.uDemTexture.value;
    if (demTexture instanceof THREE.Texture) {
      demTexture.dispose();
    }

    super.dispose();
  }
}
