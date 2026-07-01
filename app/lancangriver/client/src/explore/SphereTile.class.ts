import * as THREE from "three";
import { ITileNode, SphereTileKey } from "../calc/types";
import { tileBounds4326 } from "../calc/mercator";
import { EARTH_RADIUS, latlngToSphere } from "../calc/sphere";
import { TileGeometry } from "./geometries/TileGeometry.class";
import { TileBasicMaterial } from "./materials/TileBasicMaterial.class";
import { TileDemMaterial } from "./materials/TileDemMaterial.class";
import { TileCleanMaterial } from "./materials/TileCleanMaterial.class";

type TileSurfaceMaterial = TileBasicMaterial | TileDemMaterial;

type Parameters = {
  radius?: number;
};

export class SphereTile extends THREE.Mesh<TileGeometry, TileSurfaceMaterial> {
  $tNode: ITileNode;
  center: THREE.Vector3;
  centerLatlng: { lat: number; lng: number };

  static readonly MAX_DEM_ZOOM = 15;
  static readonly SKIRT_DEPTH_METERS = 400;

  constructor(
    readonly textureLoader: THREE.TextureLoader,
    readonly imageLoader: THREE.ImageLoader,
    readonly tile: SphereTileKey,
    readonly parameters: Parameters,
  ) {
    const [west, south, east, north] = tileBounds4326(tile.z, tile.x, tile.y);

    const geometry = new TileGeometry({
      southwest: { lat: south, lng: west },
      northeast: { lat: north, lng: east },
      radius: parameters.radius ?? 1,
      skirtDepth: SphereTile.SKIRT_DEPTH_METERS,
    });

    const material = new TileCleanMaterial(textureLoader, {
      tileKey: tile,
    });

    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    const centerPoint = latlngToSphere(centerLat, centerLng, EARTH_RADIUS);

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
      ? new TileDemMaterial(this.textureLoader, this.imageLoader, {
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
