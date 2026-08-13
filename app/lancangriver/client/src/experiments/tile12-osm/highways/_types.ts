import * as THREE from "three";

export type HighwayGeometryEntry = {
  geometry: THREE.BufferGeometry;
  widthMeters: number;
  offGroundMeters: number;
  centerline: THREE.Vector3[];
};

export type HighwayCenterlineSample = {
  point: THREE.Vector3;
  cumulativeDistance: number;
};
