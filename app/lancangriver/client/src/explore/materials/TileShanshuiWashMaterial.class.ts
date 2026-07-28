import * as THREE from "three";
import { SphereTileKey } from "../../calc/types";
import { TileBasicMaterial } from "./TileBasicMaterial.class";
import vertexShader from "./shaders/tilewash.vert.glsl?raw";
import fragmentShader from "./shaders/tilewash.frag.glsl?raw";
import { ShanshuiWashParams, clampWashParams } from "./shanshuiWashConfig";

type Parameters = {
  tileKey: SphereTileKey;
  washParams: ShanshuiWashParams;
};

export class TileShanshuiWashMaterial extends TileBasicMaterial {
  constructor(textureLoader: THREE.TextureLoader, parameters: Parameters) {
    super(textureLoader, { tileKey: parameters.tileKey });
    const safe = clampWashParams(parameters.washParams);

    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.uniforms.uToneBands = { value: safe.toneBands };
    this.uniforms.uInkEdgeStrength = { value: safe.edgeStrength };
    this.uniforms.uWashContrast = { value: safe.washContrast };
    this.uniforms.uHazeStrength = { value: safe.hazeStrength };
    this.uniforms.uSatelliteBlendOpacity = {
      value: safe.satelliteBlendOpacity,
    };
    this.uniforms.uInkDarkness = { value: safe.inkDarkness };
    this.uniforms.uPaperLightness = { value: safe.paperLightness };
    this.uniforms.uRidgeStrength = { value: safe.ridgeStrength };
    this.uniforms.uValleyLift = { value: safe.valleyLift };
    this.uniforms.uSatelliteShadowBoost = { value: safe.satelliteShadowBoost };
    this.uniforms.uCameraDistanceMeters = { value: 1_000.0 };
    this.needsUpdate = true;
  }

  setCameraDistanceMeters(distance: number): void {
    this.uniforms.uCameraDistanceMeters.value = Math.max(0, distance);
  }

  setWashParams(next: ShanshuiWashParams): void {
    const safe = clampWashParams(next);
    this.uniforms.uToneBands.value = safe.toneBands;
    this.uniforms.uInkEdgeStrength.value = safe.edgeStrength;
    this.uniforms.uWashContrast.value = safe.washContrast;
    this.uniforms.uHazeStrength.value = safe.hazeStrength;
    this.uniforms.uSatelliteBlendOpacity.value = safe.satelliteBlendOpacity;
    this.uniforms.uInkDarkness.value = safe.inkDarkness;
    this.uniforms.uPaperLightness.value = safe.paperLightness;
    this.uniforms.uRidgeStrength.value = safe.ridgeStrength;
    this.uniforms.uValleyLift.value = safe.valleyLift;
    this.uniforms.uSatelliteShadowBoost.value = safe.satelliteShadowBoost;
  }
}
