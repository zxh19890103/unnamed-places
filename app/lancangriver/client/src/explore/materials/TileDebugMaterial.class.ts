import * as THREE from 'three';
import { SphereTileKey } from '../_types';

type Parameters = {
  tileKey: SphereTileKey;
};

function hashTileKey({ z, x, y }: SphereTileKey): number {
  // 32-bit mixing for stable pseudo-random color per tile key.
  let h = (z * 73856093) ^ (x * 19349663) ^ (y * 83492791);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function colorFromTileKey(tileKey: SphereTileKey): THREE.Color {
  const hash = hashTileKey(tileKey);

  // Keep saturation/value in a readable debug range.
  const hue = (hash & 0xffff) / 0xffff;
  const saturation = 0.55 + (((hash >>> 16) & 0xff) / 0xff) * 0.35;
  const value = 0.65 + (((hash >>> 24) & 0xff) / 0xff) * 0.3;

  const color = new THREE.Color();
  color.setHSL(hue, Math.min(1, saturation), Math.min(1, value));
  return color;
}

export class TileDebugMaterial extends THREE.MeshBasicMaterial {
  constructor(parameters: Parameters) {
    super({
      side: THREE.DoubleSide,
      color: colorFromTileKey(parameters.tileKey),
    });
  }
}
