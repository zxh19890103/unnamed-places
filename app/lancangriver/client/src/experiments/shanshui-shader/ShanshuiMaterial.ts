import * as THREE from "three";
import { ELEVATION_SCALE } from "../../calc/constants";
import vertexShader from "./shaders/shanshui.vert.glsl?raw";
import fragmentShader from "./shaders/shanshui.frag.glsl?raw";

export type ElevationRange = {
  minMeters: number;
  maxMeters: number;
};

type ShanshuiMaterialParameters = {
  demTexture?: THREE.Texture | null;
  derivativesTexture?: THREE.Texture | null;
  displacementScale?: number;
};

export class ShanshuiMaterial extends THREE.ShaderMaterial {
  private demTexture: THREE.Texture | null = null;
  private derivativesTexture: THREE.Texture | null = null;

  constructor(parameters: ShanshuiMaterialParameters = {}) {
    const {
      demTexture = null,
      derivativesTexture = null,
      displacementScale = ELEVATION_SCALE,
    } = parameters;

    super({
      uniforms: {
        uDemTexture: { value: demTexture },
        uDerivativesTexture: { value: derivativesTexture },
        uDemReady: { value: demTexture ? 1.0 : 0.0 },
        uDerivativesReady: { value: derivativesTexture ? 1.0 : 0.0 },
        uDisplacementScale: { value: displacementScale },
        uSunAzimuthRad: { value: 2.45 },
        uSunElevationRad: { value: 0.8 },
        uAmbientStrength: { value: 0.36 },
        uDiffuseStrength: { value: 0.92 },
        uShowNormals: { value: 0.0 },
        uDemTexelSize: { value: new THREE.Vector2(1 / 256, 1 / 256) },
        uSlopeDarkenStrength: { value: 0.1 },
        uElevationMinMeters: { value: 0.0 },
        uElevationMaxMeters: { value: 4000.0 },
        uBaseTerrainColor: { value: new THREE.Color("#718c5a") },
        uSteepColor: { value: new THREE.Color("#b8ad99") },
      },
      vertexShader,
      fragmentShader,
    });

    this.demTexture = demTexture;
    this.derivativesTexture = derivativesTexture;
  }

  override dispose(): void {
    if (this.demTexture) {
      this.demTexture.dispose();
      this.demTexture = null;
    }

    if (this.derivativesTexture) {
      this.derivativesTexture.dispose();
      this.derivativesTexture = null;
    }

    this.uniforms.uDemTexture.value = null;
    this.uniforms.uDerivativesTexture.value = null;
    this.uniforms.uDemReady.value = 0.0;
    this.uniforms.uDerivativesReady.value = 0.0;

    super.dispose();
  }

  setDemTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    this.demTexture = texture;
    this.uniforms.uDemTexture.value = texture;
    this.uniforms.uDemReady.value = 1.0;
  }

  setDerivativesTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    this.derivativesTexture = texture;
    this.uniforms.uDerivativesTexture.value = texture;
    this.uniforms.uDerivativesReady.value = 1.0;
  }

  setShowNormals(enabled: boolean): void {
    this.uniforms.uShowNormals.value = enabled ? 1.0 : 0.0;
  }

  setSlopeDarkenStrength(strength: number): void {
    this.uniforms.uSlopeDarkenStrength.value = THREE.MathUtils.clamp(
      strength,
      0.0,
      2.0,
    );
  }

  setElevationRange(minMeters: number, maxMeters: number): void {
    const safeMin = Number.isFinite(minMeters) ? minMeters : 0;
    const safeMax = Number.isFinite(maxMeters) ? maxMeters : safeMin + 1;

    this.uniforms.uElevationMinMeters.value = safeMin;
    this.uniforms.uElevationMaxMeters.value = Math.max(safeMax, safeMin + 1);
  }
}
