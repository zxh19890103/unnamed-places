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

  constructor(textureLoader: THREE.TextureLoader, parameters: Parameters) {
    const { tileKey, elevationScale = ELEVATION_SCALE } = parameters;

    const satelliteTexture = new THREE.Texture();
    const demTexture = new THREE.Texture();

    super({
      side: THREE.BackSide,
      uniforms: {
        uSatelliteTexture: { value: satelliteTexture },
        uDemTexture: { value: demTexture },
        uSatelliteReady: { value: 0 },
        uDemReady: { value: 0 },
        uElevationScale: { value: elevationScale },
      },
      vertexShader: `
      uniform sampler2D uDemTexture;
      uniform float uDemReady;
      uniform float uElevationScale;

      varying vec2 vUv;

      void main() {
        vUv = uv;

        vec3 displaced = position;

        if (uDemReady > 0.5) {
          vec3 demRgb = texture2D(uDemTexture, uv).rgb * 255.0;
          float elevation = (demRgb.r * 256.0 + demRgb.g + demRgb.b / 256.0) - 32768.0;
          displaced = position + normal * (elevation * uElevationScale);
        }

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
      fragmentShader: `
      uniform sampler2D uSatelliteTexture;
      uniform float uSatelliteReady;

      varying vec2 vUv;

      void main() {
        vec3 fallbackColor = vec3(0.2, 0.2, 0.2);
        vec3 satColor = texture2D(uSatelliteTexture, vUv).rgb;
        vec3 outputColor = mix(fallbackColor, satColor, uSatelliteReady);
        gl_FragColor = vec4(outputColor, 1.0);
      }
    `,
    });

    const imageLoader = new THREE.ImageLoader(textureLoader.manager);

    this.pendingSatelliteImage = imageLoader.load(
      `${BASE_URL}/raster/satellite/${tileKey.z}/${tileKey.x}/${tileKey.y}.jpeg`,
      (image) => {
        if (!this.pendingSatelliteImage) {
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

        this.uniforms.uDemReady.value = 1;
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
