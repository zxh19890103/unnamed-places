import * as THREE from "three";
import type { TileNode } from "./lod";
import type { SphereTile } from "./SphereTile.class";
import type { SphereTileKey } from "../calc/types";
import { enumerateChildTiles, disatanceToZoom } from "../calc/mercator";
import { BASE_URL } from "../calc/constants";

const TILE_SIZE = 256;

export type ChildTile = SphereTileKey & {
  offsetX: number;
  offsetY: number;
};

/**
 * Compositor for fly-mode satellite textures.
 * Updates parent tile satellite textures with higher-resolution child composites
 * without creating new mesh geometry (stays within same parent mesh).
 */
export class FlySatelliteCompositor {
  private textureLoader: THREE.TextureLoader;
  private canvas: HTMLCanvasElement;
  private canvasContext: CanvasRenderingContext2D;
  private composedTextures: Map<string, THREE.Texture> = new Map();
  private requestControllers: Map<string, AbortController> = new Map();

  constructor(textureLoader: THREE.TextureLoader) {
    this.textureLoader = textureLoader;
    this.canvas = document.createElement("canvas");
    this.canvasContext = this.canvas.getContext("2d")!;
    if (!this.canvasContext) {
      throw new Error("Failed to create 2D canvas context");
    }
  }

  /**
   * Update satellite textures for visible tiles in fly mode.
   * For each tile, compute desired zoom from camera distance and compose if needed.
   */
  async updateForTiles(
    parentTiles: Array<{
      node: TileNode;
      tile: SphereTile;
      cameraDistance: number;
    }>,
  ): Promise<void> {
    for (const { node, tile, cameraDistance } of parentTiles) {
      // Compute desired satellite zoom based on distance
      const targetZoom = disatanceToZoom(cameraDistance);

      // Skip if already at target or if request is pending
      const tileKey = `${node.z}/${node.x}/${node.y}`;

      if (node.satelliteCurrentZoom === targetZoom && !node.satellitePending) {
        continue;
      }

      if (node.satellitePending) {
        continue; // Wait for previous request
      }

      // Set target and mark pending
      node.satelliteTargetZoom = targetZoom;
      node.satellitePending = true;
      node.satelliteRequestSeq = (node.satelliteRequestSeq ?? 0) + 1;
      const requestSeq = node.satelliteRequestSeq;

      this.requestControllers.get(tileKey)?.abort();
      const controller = new AbortController();
      this.requestControllers.set(tileKey, controller);

      // Compose texture asynchronously
      this.composeAndApplyTexture(
        tile,
        node,
        targetZoom,
        requestSeq,
        controller.signal,
      );
    }
  }

  /**
   * Compose satellite tile texture and apply to material.
   */
  private async composeAndApplyTexture(
    tile: SphereTile,
    node: TileNode,
    targetZoom: number,
    requestSeq: number,
    signal: AbortSignal,
  ): Promise<void> {
    const tileKey = `${node.z}/${node.x}/${node.y}`;

    try {
      const composedTexture = await this.composeChildTiles(
        node.key,
        targetZoom,
        signal,
      );

      // Verify request is still valid (not stale)
      if (node.satelliteRequestSeq !== requestSeq) {
        composedTexture.dispose();
        return;
      }

      // Apply texture to material
      if (tile.material instanceof THREE.ShaderMaterial) {
        const oldTexture = tile.material.uniforms.uSatelliteTexture.value;

        // Dispose old composed texture if owned by compositor
        if (
          oldTexture instanceof THREE.CanvasTexture &&
          this.composedTextures.has(tileKey)
        ) {
          oldTexture.dispose();
          this.composedTextures.delete(tileKey);
        }

        // Store and apply new texture
        tile.material.uniforms.uSatelliteTexture.value = composedTexture;
        tile.material.uniformsNeedUpdate = true;

        this.composedTextures.set(tileKey, composedTexture);

        node.satelliteCurrentZoom = targetZoom;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.warn(
        `[Compositor] Failed to compose texture for tile ${node.z}/${node.x}/${node.y}:`,
        error,
      );
    } finally {
      const active = this.requestControllers.get(tileKey);
      if (active?.signal === signal) {
        this.requestControllers.delete(tileKey);
      }

      node.satellitePending = false;
    }
  }

  /**
   * Compose child satellite tiles into a single canvas texture.
   */
  private async composeChildTiles(
    parentTile: SphereTileKey,
    targetZoom: number,
    signal: AbortSignal,
  ): Promise<THREE.CanvasTexture | THREE.Texture> {
    if (signal.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }

    // If target zoom <= parent zoom, no compositing needed
    if (targetZoom <= parentTile.z) {
      const texture = await this.loadTextureAsync(
        this.tileImageUrl(parentTile),
        signal,
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    // Enumerate child tiles
    const childTiles = enumerateChildTiles(parentTile, targetZoom);
    const factor = 2 ** (targetZoom - parentTile.z);

    // Resize canvas for composition
    this.canvas.width = TILE_SIZE * factor;
    this.canvas.height = TILE_SIZE * factor;

    // Load and draw child tiles
    const loadedChildren = await Promise.all(
      childTiles.map(async (child) => {
        const texture = await this.loadTextureAsync(
          this.tileImageUrl(child),
          signal,
        );
        return { texture, child };
      }),
    );

    for (const { texture, child } of loadedChildren) {
      const offsetChild = child as ChildTile;
      const image = texture.image as CanvasImageSource | null;
      if (!image) {
        texture.dispose();
        continue;
      }

      this.canvasContext.drawImage(
        image,
        offsetChild.offsetX * TILE_SIZE,
        offsetChild.offsetY * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
      );
      texture.dispose();
    }

    // Create canvas texture
    const compositeTexture = new THREE.CanvasTexture(this.canvas);
    compositeTexture.colorSpace = THREE.SRGBColorSpace;
    return compositeTexture;
  }

  private loadTextureAsync(
    url: string,
    signal: AbortSignal,
  ): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Request aborted", "AbortError"));
        return;
      }

      const imageLoader = new THREE.ImageLoader(this.textureLoader.manager);
      let image: HTMLImageElement | null = null;

      const onAbort = () => {
        if (image) {
          image.onload = null;
          image.onerror = null;
          image.src = "";
        }
        reject(new DOMException("Request aborted", "AbortError"));
      };

      signal.addEventListener("abort", onAbort, { once: true });

      image = imageLoader.load(
        url,
        (loadedImage) => {
          signal.removeEventListener("abort", onAbort);
          const texture = new THREE.Texture(loadedImage);
          texture.needsUpdate = true;
          texture.colorSpace = THREE.SRGBColorSpace;
          resolve(texture);
        },
        undefined,
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error ?? new Error(`Failed to load texture: ${url}`));
        },
      );
    });
  }

  /**
   * Build satellite tile image URL.
   */
  private tileImageUrl(tile: SphereTileKey): string {
    return `${BASE_URL}/raster/satellite/${tile.z}/${tile.x}/${tile.y}.jpeg`;
  }

  /**
   * Dispose all cached composed textures.
   */
  disposeComposedTextures(): void {
    for (const controller of this.requestControllers.values()) {
      controller.abort();
    }

    this.requestControllers.clear();

    for (const texture of this.composedTextures.values()) {
      texture.dispose();
    }

    this.composedTextures.clear();
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.disposeComposedTextures();
    this.canvas.remove();
  }
}
