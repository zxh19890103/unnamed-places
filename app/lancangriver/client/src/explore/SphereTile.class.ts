import * as THREE from "three";
import { ITileNode, SphereTileKey } from "./_types";
import { tileBounds4326 } from "../calc/mercator";
import { TileGeometry } from "./geometries/TileGeometry.class";
import { TileBasicMaterial } from "./materials/TileBasicMaterial.class";
import { TileDemMaterial } from "./materials/TileDemMaterial.class";
import { TileDebugMaterial } from "./materials/TileDebugMaterial.class";
import { TileCleanMaterial } from "./materials/TileCleanMaterial.class";
import { ShanshuiMaterial } from "./materials/ShanshuiMaterial.class";
import { latlngToSphere } from "@/_3dtiles";
import { BASE_URL, ELEVATION_SCALE } from "../calc/constants";

export enum TileMaterialMode {
  Basic = "basic",
  Dem = "dem",
  Clean = "clean",
  Debug = "debug",
  ShanshuiWash = "shanshui-wash",
}

type TileSurfaceMaterial =
  | TileBasicMaterial
  | TileDemMaterial
  | TileDebugMaterial
  | TileCleanMaterial
  | ShanshuiMaterial;

type Parameters = {
  radius?: number;
};

export class SphereTile extends THREE.Mesh<TileGeometry, TileSurfaceMaterial> {
  $node: ITileNode;

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

    const segments = Math.min(
      96,
      Math.max(64, Math.round(32 * Math.pow(2, (12 - tile.z) * 0.5))),
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

  setMaterialMode(mode: TileMaterialMode): void {
    if (this.materialMode === mode && this.isCurrentMaterialForMode(mode)) {
      return; // Already in requested mode
    }

    const nextMaterial = this.createModeMaterial(mode);

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

  applyMaterialUniforms(uniforms: Record<string, any>) {
    if (!this.material) return;

    if (this.material instanceof THREE.ShaderMaterial) {
      const uniforms0 = this.material.uniforms;
      Object.assign(uniforms0, uniforms);
      this.material.needsUpdate = true;
    }
  }

  private createModeMaterial(
    mode: TileMaterialMode,
  ): TileSurfaceMaterial | null {
    switch (mode) {
      case TileMaterialMode.Basic:
        return new TileBasicMaterial(this.textureLoader, {
          tileKey: this.tile,
        });

      case TileMaterialMode.Dem:
        return new TileDemMaterial(this.textureLoader, this.imageLoader, {
          tileKey: this.tile,
        });

      case TileMaterialMode.Clean:
        return new TileCleanMaterial(this.textureLoader, {
          tileKey: this.tile,
        });
      case TileMaterialMode.Debug:
        return new TileDebugMaterial({
          tileKey: this.tile,
        });

      case TileMaterialMode.ShanshuiWash: {
        const material = new ShanshuiMaterial({
          displacementScale: ELEVATION_SCALE,
        });
        material.side = THREE.BackSide;
        this.loadShanshuiTextures(material);
        return material;
      }

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

      case TileMaterialMode.Debug:
        return this.material instanceof TileDebugMaterial;

      case TileMaterialMode.Clean:
        return this.material instanceof TileCleanMaterial;

      case TileMaterialMode.ShanshuiWash:
        return this.material instanceof ShanshuiMaterial;

      default:
        return false;
    }
  }

  private loadShanshuiTextures(material: ShanshuiMaterial): void {
    const { z, x, y } = this.tile;

    const demUrl = `${BASE_URL}/raster/dem/${z}/${x}/${y}.png`;
    this.imageLoader.load(
      demUrl,
      (image) => {
        const texture = new THREE.Texture();
        texture.image = image;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        material.setDemTexture(texture);
      },
      undefined,
      () => {
        // Ignore DEM load failures for the shader material; it will fall back gracefully.
      },
    );

    const derivativesUrl = `${BASE_URL}/raster/dem/${z}/${x}/${y}/derivatives.png`;
    this.imageLoader.load(
      derivativesUrl,
      (image) => {
        const texture = new THREE.Texture();
        texture.image = image;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        material.setDerivativesTexture(texture);
      },
      undefined,
      () => {
        // Ignore derivatives load failures; the material already has a fallback color.
      },
    );
  }
}
