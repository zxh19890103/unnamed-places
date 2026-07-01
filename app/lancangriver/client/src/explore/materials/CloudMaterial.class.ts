import * as THREE from "three";
import vertexShader from "./shaders/cloud.vert.glsl?raw";
import fragmentShader from "./shaders/cloud.frag.glsl?raw";

type Parameters = {
  color?: THREE.ColorRepresentation;
  size?: number;
  opacity?: number;
  softness?: number;
  sizeAttenuation?: boolean;
  viewportHeight?: number;
  atlasTexture?: THREE.Texture;
  atlasGrid?: number;
};

function createFallbackAtlasTexture() {
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1);
  texture.needsUpdate = true;
  return texture;
}

export class CloudMaterial extends THREE.ShaderMaterial {
  /**
   * the basic logic is the same to THREE.PointsMaterial,
   * but we'll add more subtle changes in shader.
   * @param params
   */
  constructor(params: Parameters) {
    const {
      color = 0xffffff,
      size = 48,
      opacity = 0.8,
      softness = 0.5,
      sizeAttenuation = false,
      viewportHeight,
      atlasTexture,
      atlasGrid = 4,
    } = params;

    const defaultViewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    const fallbackAtlasTexture = createFallbackAtlasTexture();

    super({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uSize: { value: Math.max(1, size) },
        uOpacity: { value: THREE.MathUtils.clamp(opacity, 0, 1) },
        uSoftness: { value: THREE.MathUtils.clamp(softness, 0.05, 0.95) },
        uSizeAttenuation: { value: sizeAttenuation ? 1 : 0 },
        uViewportHeight: {
          value: Math.max(1, viewportHeight ?? defaultViewportHeight),
        },
        uAtlasTexture: { value: atlasTexture ?? fallbackAtlasTexture },
        uAtlasGrid: { value: Math.max(1, Math.floor(atlasGrid)) },
      },
      vertexShader,
      fragmentShader,
    });
  }
}
