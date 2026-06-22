import * as THREE from "three";
import { ITileNode, SphereTileKey } from "../calc/types";
import { tileBounds4326 } from "../calc/mercator";
import { TileGeometry } from "./geometries/TileGeometry.class";
import { TileBasicMaterial } from "./materials/TileBasicMaterial.class";
import { TileDemMaterial } from "./materials/TileDemMaterial.class";

type TileSurfaceMaterial = TileBasicMaterial | TileDemMaterial;

type Parameters = {
  radius?: number;
};

export class SphereTile extends THREE.Mesh<TileGeometry, TileSurfaceMaterial> {
  $tNode: ITileNode;

  static readonly MAX_DEM_ZOOM = 15;

  constructor(
    readonly textureLoader: THREE.TextureLoader,
    readonly tile: SphereTileKey,
    readonly parameters: Parameters,
  ) {
    const [west, south, east, north] = tileBounds4326(tile.z, tile.x, tile.y);

    const geometry = new TileGeometry({
      southwest: { lat: south, lng: west },
      northeast: { lat: north, lng: east },
      radius: parameters.radius ?? 1,
    });

    const material = new TileBasicMaterial(textureLoader, {
      tileKey: tile,
    });

    super(geometry, material);

    this.userData.tile = { ...tile };
  }

  canUseDemMaterial(): boolean {
    return this.tile.z <= SphereTile.MAX_DEM_ZOOM;
  }

  setDemMaterialEnabled(enabled: boolean): boolean {
    if (enabled && !this.canUseDemMaterial()) {
      return false;
    }

    if (enabled && this.material instanceof TileDemMaterial) {
      return true;
    }

    if (!enabled && this.material instanceof TileBasicMaterial) {
      return true;
    }

    const nextMaterial: TileSurfaceMaterial = enabled
      ? new TileDemMaterial(this.textureLoader, {
          tileKey: this.tile,
        })
      : new TileBasicMaterial(this.textureLoader, {
          tileKey: this.tile,
        });

    const prevMaterial = this.material;
    this.material = nextMaterial;
    prevMaterial.dispose();

    return true;
  }
}
