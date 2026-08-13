import * as THREE from "three";

export type RoofStyle =
  | "fence"
  | "modern"
  | "fun"
  | "flat"
  | "skillion"
  | "gabled"
  | "hipped";

export type PolygonFeatureKind = "building" | "water" | "highway" | "other";

export type PolygonFeatureToGeometry = {
  kind: PolygonFeatureKind;
  geometry: THREE.BufferGeometry;
  centroid: [number, number];
  extrudedMeters: number;
};
