import * as THREE from "three";

import { VendorBundle } from "./_types";

export function createVendors(): VendorBundle {
  const loadingManager = new THREE.LoadingManager();
  const loadingSnapshot = {
    loaded: 0,
    total: 0,
    active: false,
    errors: 0,
    lastErrorUrl: null as string | null,
  };

  loadingManager.onStart = (_url, loaded, total) => {
    loadingSnapshot.active = true;
    loadingSnapshot.loaded = loaded;
    loadingSnapshot.total = total;
  };
  loadingManager.onProgress = (_url, loaded, total) => {
    loadingSnapshot.active = true;
    loadingSnapshot.loaded = loaded;
    loadingSnapshot.total = total;
  };
  loadingManager.onLoad = () => {
    loadingSnapshot.active = false;
  };
  loadingManager.onError = (url) => {
    loadingSnapshot.active = true;
    loadingSnapshot.errors += 1;
    loadingSnapshot.lastErrorUrl = url;
  };

  const textureLoader = new THREE.TextureLoader(loadingManager);
  const imageLoader = new THREE.ImageLoader(loadingManager);
  const cloudAtlasTexture = textureLoader.load("/clouds_in-one.png");
  cloudAtlasTexture.wrapS = THREE.ClampToEdgeWrapping;
  cloudAtlasTexture.wrapT = THREE.ClampToEdgeWrapping;
  cloudAtlasTexture.magFilter = THREE.LinearFilter;
  cloudAtlasTexture.minFilter = THREE.LinearMipmapLinearFilter;

  return {
    loadingManager,
    loadingSnapshot,
    textureLoader,
    imageLoader,
    cloudAtlasTexture,
  };
}
