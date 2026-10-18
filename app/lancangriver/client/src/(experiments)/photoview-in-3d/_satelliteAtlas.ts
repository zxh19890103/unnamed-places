import * as THREE from 'three';
import { EARTH_RADIUS } from '@/calc/constants';
import { LatLng, latLngToTileXY } from './_fns';

export type SatelliteAtlasOptions = {
  centerX: number;
  centerY: number;
  expand?: number;
  zoom?: number;
  tilePixelSize?: number;
};

export type SatelliteTileSample = {
  width: number;
  height: number;
  data: Uint8Array;
};

export class SatelliteAtlas {
  readonly texture: THREE.DataTexture;
  readonly atlasData: Uint8Array;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly tilePixelSize: number;

  readonly minTileX: number;
  readonly minTileY: number;
  readonly cols: number;
  readonly rows: number;
  readonly zoom: number;

  private isDisposed = false;
  readonly textureUniform: THREE.IUniform<THREE.Texture> = { value: null };

  constructor({
    centerX,
    centerY,
    expand = 2,
    zoom = 14,
    tilePixelSize = 256,
  }: SatelliteAtlasOptions) {
    this.zoom = zoom;
    this.tilePixelSize = tilePixelSize;

    this.minTileX = centerX - expand;
    this.minTileY = centerY - expand;
    this.cols = expand * 2 + 1;
    this.rows = expand * 2 + 1;

    this.atlasWidth = this.cols * this.tilePixelSize;
    this.atlasHeight = this.rows * this.tilePixelSize;

    this.atlasData = new Uint8Array(this.atlasWidth * this.atlasHeight * 4);

    this.texture = new THREE.DataTexture(
      this.atlasData,
      this.atlasWidth,
      this.atlasHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    this.textureUniform.value = this.texture;
  }

  static sampleImageToTile(image: CanvasImageSource, tilePixelSize = 256): SatelliteTileSample {
    const width = Math.max(1, tilePixelSize);
    const height = Math.max(1, tilePixelSize);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { width, height, data: new Uint8Array(width * height * 4) };
    }

    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return {
      width: imageData.width,
      height: imageData.height,
      data: new Uint8Array(imageData.data.buffer),
    };
  }

  updateTile(tileX: number, tileY: number, sample: SatelliteTileSample): void {
    if (this.isDisposed) return;

    console.log('updtetile called');

    const col = tileX - this.minTileX;
    const row = tileY - this.minTileY;

    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return;
    }

    const startX = col * this.tilePixelSize;
    const rowFromBottom = this.rows - 1 - row;
    const startY = rowFromBottom * this.tilePixelSize;
    const srcWidth = sample.width;
    const srcHeight = sample.height;
    const srcData = sample.data;

    for (let sy = 0; sy < srcHeight; sy += 1) {
      // const dstY = startY + sy;
      const dstY = startY + (srcHeight - 1 - sy);
      if (dstY < 0 || dstY >= this.atlasHeight) continue;

      const srcOffset = sy * srcWidth * 4;
      const dstOffset = (dstY * this.atlasWidth + startX) * 4;

      for (let sx = 0; sx < srcWidth; sx += 1) {
        const srcIndex = srcOffset + sx * 4;
        const dstIndex = dstOffset + sx * 4;

        this.atlasData[dstIndex + 0] = srcData[srcIndex + 0];
        this.atlasData[dstIndex + 1] = srcData[srcIndex + 1];
        this.atlasData[dstIndex + 2] = srcData[srcIndex + 2];
        this.atlasData[dstIndex + 3] = srcData[srcIndex + 3];
      }
    }

    this.texture.needsUpdate = true;
  }

  getSatelliteUv(lat: number, lng: number): { u: number; v: number } {
    const tileXY = latLngToTileXY(lat, lng, this.zoom);
    const u = (tileXY.x - this.minTileX) / this.cols;
    const v = 1.0 - (tileXY.y - this.minTileY) / this.rows;

    return {
      u: Math.min(1.0, Math.max(0.0, u)),
      v: Math.min(1.0, Math.max(0.0, v)),
    };
  }

  getSatelliteUvFromOffset(
    x: number,
    z: number,
    worldCenterLatlng: LatLng,
  ): { u: number; v: number } {
    const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS;
    const metersPerDegLng = metersPerDegLat * Math.cos((worldCenterLatlng.lat * Math.PI) / 180);

    const lat = worldCenterLatlng.lat - z / metersPerDegLat;
    const lng = worldCenterLatlng.lng + x / metersPerDegLng;

    return this.getSatelliteUv(lat, lng);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.texture.dispose();
  }
}
