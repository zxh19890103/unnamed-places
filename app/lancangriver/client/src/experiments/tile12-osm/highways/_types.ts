import * as THREE from "three";
import { TileProjection } from "../tile";
import { TileCoords } from "@/osm/tiles";

export type HighwayGeometryEntry = {
  geometry: THREE.BufferGeometry;
  widthMeters: number;
  offGroundMeters: number;
  centerline: THREE.Vector3[];
  category: HighwayCategoryDefinition;
  styleId: string;
};

export type HighwayCenterlineSample = {
  point: THREE.Vector3;
  cumulativeDistance: number;
};

export type HighwayCategoryDefinition = {
  type: string;
  widthMeters: number;
  classOffset: number;

  getGeometry?: (
    feature: GeoJSON.Feature,
    centerline: THREE.Vector3[],
    options: {
      tile?: TileCoords;
      projection?: TileProjection;
    },
  ) => THREE.BufferGeometry;

  getMaterial?: (textureLoader: THREE.TextureLoader) => THREE.Material;
};
