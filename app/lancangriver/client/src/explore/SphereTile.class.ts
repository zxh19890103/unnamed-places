import * as THREE from "three";
import { ITileNode, SphereTileKey } from "../calc/types";
import { tileBounds4326 } from "../calc/mercator";
import { TileGeometry } from "./geometries/TileGeometry.class";

type Parameters = {
  radius?: number;
};

export class SphereTile extends THREE.Mesh<
  TileGeometry,
  THREE.MeshBasicMaterial
> {
  $tNode: ITileNode;

  constructor(
    readonly tile: SphereTileKey,
    readonly parameters: Parameters,
  ) {
    const [west, south, east, north] = tileBounds4326(tile.z, tile.x, tile.y);

    const geometry = new TileGeometry({
      southwest: { lat: south, lng: west },
      northeast: { lat: north, lng: east },
      latSegments: 1,
      lngSegments: 1,
      radius: parameters.radius ?? 1,
    });

    const material = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0x000000,
    });

    super(geometry, material);
    this.userData.tile = { ...tile };
  }
}
