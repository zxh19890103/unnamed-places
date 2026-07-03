import * as THREE from "three";
import { BASE_URL, ELEVATION_SCALE } from "../../calc/constants";
import { SphereTileKey } from "../../calc/types";
import vertexShader from "./shaders/tiledem.vert.glsl?raw";
import fragmentShader from "./shaders/tiledem.basic.frag.glsl?raw";

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

    super({
      side: THREE.BackSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        THREE.UniformsLib.lights,
        {
          uSatelliteTexture: { value: null },
          uDemTexture: { value: null },
          uSatelliteReady: { value: 0 },
          uDemReady: { value: 0 },
          uElevationScale: { value: elevationScale },
          uDemTexelSize: { value: new THREE.Vector2(1 / 256, 1 / 256) },
          uSaturation: { value: 1.0 },
          uContrast: { value: 1.0 },
          uGamma: { value: 1.0 },
          uVegLightStrength: { value: 6.0 },
          uColor: { value: new THREE.Color(0xffffff) },
        },
      ]),
      lights: true,
      vertexShader,
      fragmentShader,
    });

    let satelliteTexture: THREE.Texture | null = null;
    let demTexture: THREE.Texture | null = null;

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

        satelliteTexture = new THREE.Texture();
        satelliteTexture.image = image;
        satelliteTexture.needsUpdate = true;
        this.uniforms.uSatelliteTexture.value = satelliteTexture;
        this.uniforms.uSatelliteReady.value = 1;

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

        demTexture = new THREE.Texture();
        // Heightmaps should use edge-clamped nearest sampling without mipmaps
        // to reduce border interpolation artifacts between adjacent tiles.
        demTexture.wrapS = THREE.ClampToEdgeWrapping;
        demTexture.wrapT = THREE.ClampToEdgeWrapping;
        demTexture.magFilter = THREE.NearestFilter;
        demTexture.minFilter = THREE.NearestFilter;
        demTexture.generateMipmaps = false;
        demTexture.image = image;
        demTexture.needsUpdate = true;
        this.uniforms.uDemTexture.value = demTexture;
        this.uniforms.uDemReady.value = 1;

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
