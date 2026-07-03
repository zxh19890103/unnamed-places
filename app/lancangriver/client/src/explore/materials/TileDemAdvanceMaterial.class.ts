import * as THREE from "three";
import { BASE_URL, ELEVATION_SCALE } from "../../calc/constants";
import { SphereTileKey } from "../../calc/types";
import vertexShader from "./shaders/tiledem.advance.vert.glsl?raw";
import fragmentShader from "./shaders/tiledem.advance.frag.glsl?raw";

type Parameters = {
  tileKey: SphereTileKey;
  elevationScale?: number;
  hillshadeEnabled?: boolean;
  colorRampScale?: number;
};

export class TileDemAdvanceMaterial extends THREE.ShaderMaterial {
  private pendingDemImage: HTMLImageElement | null = null;

  private pendingDerivativesImage: HTMLImageElement | null = null;

  private demTextureReady = false;

  private derivativesTextureReady = false;

  private demTexture: THREE.Texture | null = null;

  private derivativesTexture: THREE.Texture | null = null;

  private tileKey: SphereTileKey;

  constructor(
    textureLoader: THREE.TextureLoader,
    imageLoader: THREE.ImageLoader,
    parameters: Parameters,
  ) {
    const {
      tileKey,
      elevationScale = ELEVATION_SCALE,
      hillshadeEnabled = false,
      colorRampScale = 1.0,
    } = parameters;

    super({
      side: THREE.BackSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uDemTexture: { value: null },
          uDerivativesTexture: { value: null },
          uDemReady: { value: 0 },
          uDerivativesReady: { value: 0 },
          uElevationScale: { value: elevationScale },
          uDemTexelSize: { value: new THREE.Vector2(1 / 256, 1 / 256) },
          uHillshadeEnabled: { value: hillshadeEnabled ? 1 : 0 },
          uColorRampScale: { value: colorRampScale },
        },
      ]),
      vertexShader,
      fragmentShader,
    });

    this.tileKey = tileKey;

    this.loadTextures(textureLoader, imageLoader);
  }

  private loadTextures(
    textureLoader: THREE.TextureLoader,
    imageLoader: THREE.ImageLoader,
  ): void {
    const { z, x, y } = this.tileKey;

    // Load DEM texture
    const demUrl = `${BASE_URL}/raster/dem/${z}/${x}/${y}.png`;
    this.pendingDemImage = imageLoader.load(
      demUrl,
      (image) => {
        if (!this.pendingDemImage) {
          return;
        }

        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          this.pendingDemImage = null;
          return;
        }

        const demTexture = new THREE.Texture();
        // Heightmaps should use edge-clamped nearest sampling without mipmaps
        demTexture.wrapS = THREE.ClampToEdgeWrapping;
        demTexture.wrapT = THREE.ClampToEdgeWrapping;
        demTexture.magFilter = THREE.NearestFilter;
        demTexture.minFilter = THREE.NearestFilter;
        demTexture.generateMipmaps = false;
        demTexture.image = image;
        demTexture.needsUpdate = true;
        this.demTexture = demTexture;
        this.uniforms.uDemTexture.value = demTexture;
        this.demTextureReady = true;
        this.uniforms.uDemReady.value = 1;

        this.pendingDemImage = null;
      },
      undefined,
      () => {
        this.pendingDemImage = null;
      },
    );

    // Load derivatives texture
    const derivativesUrl = `${BASE_URL}/raster/dem/${z}/${x}/${y}/derivatives.png`;
    this.pendingDerivativesImage = imageLoader.load(
      derivativesUrl,
      (image) => {
        if (!this.pendingDerivativesImage) {
          return;
        }

        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          this.pendingDerivativesImage = null;
          return;
        }

        const derivativesTexture = new THREE.Texture();
        // Derivatives use nearest sampling like DEM
        derivativesTexture.wrapS = THREE.ClampToEdgeWrapping;
        derivativesTexture.wrapT = THREE.ClampToEdgeWrapping;
        derivativesTexture.magFilter = THREE.NearestFilter;
        derivativesTexture.minFilter = THREE.NearestFilter;
        derivativesTexture.generateMipmaps = false;
        derivativesTexture.image = image;
        derivativesTexture.needsUpdate = true;
        this.derivativesTexture = derivativesTexture;
        this.uniforms.uDerivativesTexture.value = derivativesTexture;
        this.derivativesTextureReady = true;
        this.uniforms.uDerivativesReady.value = 1;

        this.pendingDerivativesImage = null;
      },
      undefined,
      () => {
        this.pendingDerivativesImage = null;
        // Derivatives are optional; don't fail if unavailable
      },
    );
  }

  getTextureReadiness(): { dem: boolean; derivatives: boolean } {
    return {
      dem: this.demTextureReady,
      derivatives: this.derivativesTextureReady,
    };
  }

  isReady(): boolean {
    return this.demTextureReady;
  }

  setHillshadeEnabled(enabled: boolean): void {
    this.uniforms.uHillshadeEnabled.value = enabled ? 1 : 0;
  }

  getHillshadeEnabled(): boolean {
    return this.uniforms.uHillshadeEnabled.value === 1;
  }

  setColorRampScale(scale: number): void {
    this.uniforms.uColorRampScale.value = Math.max(0.1, Math.min(2.0, scale));
  }

  override dispose(): void {
    if (this.pendingDemImage) {
      this.pendingDemImage.onload = null;
      this.pendingDemImage.onerror = null;
      this.pendingDemImage.src = "";
      this.pendingDemImage = null;
    }

    if (this.pendingDerivativesImage) {
      this.pendingDerivativesImage.onload = null;
      this.pendingDerivativesImage.onerror = null;
      this.pendingDerivativesImage.src = "";
      this.pendingDerivativesImage = null;
    }

    if (this.demTexture) {
      this.demTexture.dispose();
      this.demTexture = null;
    }

    if (this.derivativesTexture) {
      this.derivativesTexture.dispose();
      this.derivativesTexture = null;
    }

    super.dispose();
  }
}
