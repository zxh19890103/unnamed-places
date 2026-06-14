import * as THREE from "three";

import { tileImageUrl } from "../data/api";
import type { TileKey } from "./request-scheduler";
import { enumerateChildTiles } from "./satellite-lod";

const TILE_SIZE = 256;

export type SatelliteCoverageTile = TileKey & {
  offsetX: number;
  offsetY: number;
};

type TextureLoaderLike = {
  loadAsync(url: string): Promise<THREE.Texture>;
};

type SatelliteCompositorOptions = {
  textureLoader?: TextureLoaderLike;
  canvasFactory?: () => HTMLCanvasElement;
};

export function enumerateSatelliteCoverage(
  demTile: TileKey,
  targetZoom: number,
): SatelliteCoverageTile[] {
  return enumerateChildTiles(demTile, targetZoom);
}

export async function loadCompositeSatelliteTextureForDemTile(
  baseUrl: string,
  demTile: TileKey,
  targetZoom: number,
  options: SatelliteCompositorOptions = {},
) {
  const coverageTiles = enumerateSatelliteCoverage(demTile, targetZoom);
  const factor = 2 ** Math.max(0, targetZoom - demTile.z);
  const canvas = options.canvasFactory?.() ?? document.createElement("canvas");
  canvas.width = TILE_SIZE * factor;
  canvas.height = TILE_SIZE * factor;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d canvas context is unavailable");
  }

  const textureLoader = options.textureLoader ?? new THREE.TextureLoader();
  const loadedTiles = await Promise.all(
    coverageTiles.map(async (tile) => ({
      tile,
      texture: await textureLoader.loadAsync(
        tileImageUrl(baseUrl, "satellite", tile),
      ),
    })),
  );

  try {
    for (const { texture, tile } of loadedTiles) {
      context.drawImage(
        texture.image,
        tile.offsetX * TILE_SIZE,
        tile.offsetY * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
      );
    }
  } finally {
    for (const { texture } of loadedTiles) {
      texture.dispose();
    }
  }

  const compositeTexture = new THREE.CanvasTexture(canvas);
  compositeTexture.colorSpace = THREE.SRGBColorSpace;
  return compositeTexture;
}
