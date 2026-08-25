import * as THREE from 'three';

export type SetupLoadingSnapshot = {
  loaded: number;
  total: number;
  active: boolean;
  errors: number;
  lastErrorUrl: string | null;
};

export type VendorBundle = {
  loadingManager: THREE.LoadingManager;
  loadingSnapshot: SetupLoadingSnapshot;
  textureLoader: THREE.TextureLoader;
  imageLoader: THREE.ImageLoader;
  cloudAtlasTexture: THREE.Texture;
};
