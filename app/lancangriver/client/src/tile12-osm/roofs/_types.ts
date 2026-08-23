import * as THREE from "three";
import { type TileProjection } from "../tile.js";

export type RoofStyle =
  | "fence"
  | "modern"
  | "fun"
  | "flat"
  | "skillion"
  | "gabled"
  | "hipped";

export type RoofGeometryFactory = (
  /**
   * @deprecated will removed.
   */
  roofprint: number[],
  features: GeoJSON.Feature,
  heightMeters: number,
  projection: TileProjection,
) => THREE.BufferGeometry;
