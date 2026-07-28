import * as THREE from "three";
import { ITileNode, SphereTileKey } from "../calc/types";
import { tileBounds4326 } from "../calc/mercator";
import { TileGeometry } from "./geometries/TileGeometry.class";
import { TileBasicMaterial } from "./materials/TileBasicMaterial.class";
import { TileDemMaterial } from "./materials/TileDemMaterial.class";
import { TileDemAdvanceMaterial } from "./materials/TileDemAdvanceMaterial.class";
import { TileEmptyMaterial } from "./materials/TileEmptyMaterial.class";
import { TileDebugMaterial } from "./materials/TileDebugMaterial.class";
import { TileCleanMaterial } from "./materials/TileCleanMaterial.class";
import { TileShanshuiWashMaterial } from "./materials/TileShanshuiWashMaterial.class";
import { getWashPreset } from "./materials/shanshuiWashConfig";
import { latlngToSphere } from "../experiments/sphere-zoom/core";

export enum TileMaterialMode {
  Basic = "basic",
  Dem = "dem",
  Clean = "clean",
  DemAdvance = "dem-advance",
  Debug = "debug",
  ShanshuiWash = "shanshui-wash",
}

type TileSurfaceMaterial =
  | TileBasicMaterial
  | TileDemMaterial
  | TileDemAdvanceMaterial
  | TileEmptyMaterial
  | TileDebugMaterial
  | TileCleanMaterial
  | TileShanshuiWashMaterial;

type Parameters = {
  radius?: number;
};

export class SphereTile extends THREE.Mesh<TileGeometry, TileSurfaceMaterial> {
  $tNode: ITileNode;
  center: THREE.Vector3;
  centerLatlng: { lat: number; lng: number };
  private materialMode: TileMaterialMode = TileMaterialMode.Basic;

  static readonly MAX_DEM_ZOOM = 15;
  static readonly SKIRT_DEPTH_METERS = 400;

  constructor(
    readonly textureLoader: THREE.TextureLoader,
    readonly imageLoader: THREE.ImageLoader,
    readonly tile: SphereTileKey,
    readonly parameters: Parameters,
  ) {
    const [west, south, east, north] = tileBounds4326(tile.z, tile.x, tile.y);

    // tile.z === 12, 32
    // tile.z === 9, 32 * 2^(12 - 9)
    const segments = Math.min(
      96,
      Math.max(16, Math.round(32 * Math.pow(2, (12 - tile.z) * 0.5))),
    );

    const geometry = new TileGeometry({
      southwest: { lat: south, lng: west },
      northeast: { lat: north, lng: east },
      radius: parameters.radius ?? 1,
      skirtDepth: SphereTile.SKIRT_DEPTH_METERS,
      latSegments: segments,
      lngSegments: segments,
    });

    const material = new TileBasicMaterial(textureLoader, {
      tileKey: tile,
    });

    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    const centerPoint = latlngToSphere(centerLat, centerLng);

    super(geometry, material);

    this.userData.tile = { ...tile };
    this.centerLatlng = { lat: centerLat, lng: centerLng };
    this.center = new THREE.Vector3(
      centerPoint.x,
      centerPoint.y,
      centerPoint.z,
    );
  }

  canUseDemMaterial(): boolean {
    return this.tile.z <= SphereTile.MAX_DEM_ZOOM;
  }

  setMaterialMode(mode: TileMaterialMode): void {
    if (this.materialMode === mode && this.isCurrentMaterialForMode(mode)) {
      return; // Already in requested mode
    }

    const nextMaterial = this.createMaterialForMode(mode);

    if (nextMaterial) {
      const prevMaterial = this.material;
      this.material = nextMaterial;
      prevMaterial.dispose();
      this.materialMode = mode;
    }
  }

  getMaterialMode(): TileMaterialMode {
    return this.materialMode;
  }

  private createMaterialForMode(
    mode: TileMaterialMode,
  ): TileSurfaceMaterial | null {
    switch (mode) {
      case TileMaterialMode.Basic:
        return new TileBasicMaterial(this.textureLoader, {
          tileKey: this.tile,
        });

      case TileMaterialMode.Dem:
        if (!this.canUseDemMaterial()) {
          return null;
        }
        return new TileDemMaterial(this.textureLoader, this.imageLoader, {
          tileKey: this.tile,
        });

      case TileMaterialMode.DemAdvance:
        if (!this.canUseDemMaterial()) {
          return null;
        }
        return new TileDemAdvanceMaterial(
          this.textureLoader,
          this.imageLoader,
          {
            tileKey: this.tile,
          },
        );
      case TileMaterialMode.Clean:
        return new TileCleanMaterial(this.textureLoader, {
          tileKey: this.tile,
        });
      case TileMaterialMode.Debug:
        return new TileDebugMaterial({
          tileKey: this.tile,
        });

      case TileMaterialMode.ShanshuiWash:
        return new TileShanshuiWashMaterial(this.textureLoader, {
          tileKey: this.tile,
          washParams: getWashPreset("balanced"),
        });

      default:
        return null;
    }
  }

  private isCurrentMaterialForMode(mode: TileMaterialMode): boolean {
    switch (mode) {
      case TileMaterialMode.Basic:
        return this.material instanceof TileBasicMaterial;

      case TileMaterialMode.Dem:
        return this.material instanceof TileDemMaterial;

      case TileMaterialMode.DemAdvance:
        return this.material instanceof TileDemAdvanceMaterial;

      case TileMaterialMode.Debug:
        return this.material instanceof TileDebugMaterial;

      case TileMaterialMode.Clean:
        return this.material instanceof TileCleanMaterial;

      case TileMaterialMode.ShanshuiWash:
        return this.material instanceof TileShanshuiWashMaterial;

      default:
        return false;
    }
  }
}
