import * as THREE from "three";
import { SphereTileKey } from "../../calc/types";
import { BASE_URL } from "../../calc/constants";

type Parameters = {
  tileKey: SphereTileKey;
};

export class TileBasicMaterial extends THREE.ShaderMaterial {
  private pendingImage: HTMLImageElement | null = null;

  constructor(textureLoader: THREE.TextureLoader, parameters: Parameters) {
    const { tileKey } = parameters;

    const satelliteTexture = new THREE.Texture();

    super({
      side: THREE.BackSide,
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uSatelliteTexture: { value: satelliteTexture },
        uTextureReady: { value: 0 },
        uDemTexture: { value: null },
        uElevationScale: { value: 0 },
      },
      vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      uniform vec3 uColor;
      uniform float uTextureReady;
      uniform sampler2D uSatelliteTexture;

      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(uSatelliteTexture, vUv);
        vec3 outputColor = mix(uColor, color.rgb, uTextureReady);

        gl_FragColor = vec4(outputColor, 1.0);
      }
    `,
    });

    const imageLoader = new THREE.ImageLoader(textureLoader.manager);
    this.pendingImage = imageLoader.load(
      `${BASE_URL}/raster/satellite/${tileKey.z}/${tileKey.x}/${tileKey.y}.jpeg`,
      (image) => {
        if (!this.pendingImage) {
          return;
        }

        this.uniforms.uTextureReady.value = 1;
        satelliteTexture.image = image;
        satelliteTexture.colorSpace = THREE.SRGBColorSpace;
        satelliteTexture.needsUpdate = true;

        this.pendingImage = null;
      },
      undefined,
      () => {
        this.pendingImage = null;
      },
    );
  }

  override dispose(): void {
    if (this.pendingImage) {
      this.pendingImage.onload = null;
      this.pendingImage.onerror = null;

      // Cancel in-flight image fetch when tile churn disposes this material.
      this.pendingImage.src = "";
      this.pendingImage = null;
    }

    const satelliteTexture = this.uniforms.uSatelliteTexture.value;
    if (satelliteTexture instanceof THREE.Texture) {
      satelliteTexture.dispose();
    }

    super.dispose();
  }
}
