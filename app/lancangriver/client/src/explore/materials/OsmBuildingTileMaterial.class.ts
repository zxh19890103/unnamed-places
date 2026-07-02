import * as THREE from "three";

type Parameters = {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  opacity?: number;
};

export class OsmBuildingTileMaterial extends THREE.MeshStandardMaterial {
  constructor(parameters: Parameters = {}) {
    const {
      color = "#f1c27d",
      roughness = 0.92,
      metalness = 0.02,
      opacity = 1,
    } = parameters;

    super({
      color,
      roughness,
      metalness,
      opacity,
      transparent: opacity < 1,
      wireframe: false,
      side: THREE.DoubleSide,
    });
  }
}
