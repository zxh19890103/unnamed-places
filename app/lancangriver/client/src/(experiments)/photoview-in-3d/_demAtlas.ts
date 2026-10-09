import * as THREE from 'three';
import { EARTH_RADIUS } from '@/calc/constants';
import { LatLng, latLngToTileXY } from './_fns';
import type { ProcessedDemResult } from './_demDecode';

export type DemAtlasOptions = {
  centerX: number;
  centerY: number;
  expand?: number;
  zoom?: number;
  demMedian?: number;
  demAvg?: number;
  demMin?: number;
};

export class DemAtlas {
  readonly texture: THREE.DataTexture;
  readonly atlasData: Float32Array;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly tilePixelSize = 256;

  readonly minTileX: number;
  readonly minTileY: number;
  readonly cols: number;
  readonly rows: number;
  readonly zoom: number;

  readonly demMedianUniform: { value: number };
  readonly textureUniform: { value: THREE.Texture };

  private isDisposed = false;

  constructor({
    centerX,
    centerY,
    expand = 2,
    zoom = 14,
    demMedian = 0,
  }: DemAtlasOptions) {
    this.zoom = zoom;
    this.demMedianUniform = { value: demMedian };

    this.minTileX = centerX - expand;
    this.minTileY = centerY - expand;
    this.cols = expand * 2 + 1;
    this.rows = expand * 2 + 1;

    this.atlasWidth = this.cols * this.tilePixelSize;
    this.atlasHeight = this.rows * this.tilePixelSize;

    // Fill atlas with demMedian so elevation - demMedian starts at 0.0 before tiles load
    this.atlasData = new Float32Array(this.atlasWidth * this.atlasHeight);
    this.atlasData.fill(demMedian);

    this.texture = new THREE.DataTexture(
      this.atlasData,
      this.atlasWidth,
      this.atlasHeight,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    this.textureUniform = { value: this.texture };
  }

  get demMedian(): number {
    return this.demMedianUniform.value;
  }

  setDemMedian(value: number): void {
    const prev = this.demMedianUniform.value;
    this.demMedianUniform.value = value;

    // Update unfilled placeholder pixels if needed
    if (prev === 0 && value !== 0) {
      for (let i = 0; i < this.atlasData.length; i += 1) {
        if (this.atlasData[i] === 0) {
          this.atlasData[i] = value;
        }
      }
      this.texture.needsUpdate = true;
    }
  }

  /**
   * Copy decoded DEM tile data into the atlas.
   */
  updateTile(tileX: number, tileY: number, dem: ProcessedDemResult): void {
    if (this.isDisposed) return;

    const col = tileX - this.minTileX;
    const row = tileY - this.minTileY;

    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return;
    }

    const tw = dem.width;
    const th = dem.height;
    const srcData = dem.data;

    const startX = col * this.tilePixelSize;
    // Row 0 is North (top of map), corresponding to highest V in DataTexture
    const rowFromBottom = this.rows - 1 - row;
    const startY = rowFromBottom * this.tilePixelSize;

    for (let ty = 0; ty < th; ty += 1) {
      const srcOffset = ty * tw;
      const dstOffset = (startY + ty) * this.atlasWidth + startX;
      for (let tx = 0; tx < tw; tx += 1) {
        this.atlasData[dstOffset + tx] = srcData[srcOffset + tx];
      }
    }

    this.texture.needsUpdate = true;
  }

  /**
   * Convert geographic lat/lng to normalized UV coordinate within the atlas [0, 1].
   */
  getDemUv(lat: number, lng: number): { u: number; v: number } {
    const tileXY = latLngToTileXY(lat, lng, this.zoom);
    const u = (tileXY.x - this.minTileX) / this.cols;
    const v = 1.0 - (tileXY.y - this.minTileY) / this.rows;
    return {
      u: Math.min(1.0, Math.max(0.0, u)),
      v: Math.min(1.0, Math.max(0.0, v)),
    };
  }

  /**
   * Convert metric scene offset relative to worldCenter to normalized UV within the atlas.
   */
  getDemUvFromOffset(
    x: number,
    z: number,
    worldCenterLatlng: LatLng,
  ): { u: number; v: number } {
    const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS;
    const metersPerDegLng = metersPerDegLat * Math.cos((worldCenterLatlng.lat * Math.PI) / 180);

    const lat = worldCenterLatlng.lat - z / metersPerDegLat;
    const lng = worldCenterLatlng.lng + x / metersPerDegLng;

    return this.getDemUv(lat, lng);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.texture.dispose();
  }
}
