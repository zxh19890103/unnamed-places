import * as THREE from 'three';

export type BuildingPalette = {
  roof: string;
  wall: string;
  face: string;
};

export type BuildingCategoryDefinition = {
  type: string;
  palette: BuildingPalette;
  levelHint: number;
};

export type BuildingVariant = {
  key: string;
  palette: BuildingPalette;
};

export type BuildingVariantBucket = {
  variant: BuildingVariant;
  roof: THREE.BufferGeometry[];
  wall: THREE.BufferGeometry[];
  face: THREE.BufferGeometry[];
};
