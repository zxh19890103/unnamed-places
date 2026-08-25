import * as THREE from 'three';
import { SphereTileKey } from '../_types';
import { TileBasicMaterial } from './TileBasicMaterial.class';
import vertexShader from './shaders/tileclean.vert.glsl?raw';
import fragmentShader from './shaders/tileclean.frag.glsl?raw';

type Parameters = {
  tileKey: SphereTileKey;
};

export class TileCleanMaterial extends TileBasicMaterial {
  constructor(textureLoader: THREE.TextureLoader, parameters: Parameters) {
    super(textureLoader, parameters);
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.needsUpdate = true;
  }
}
