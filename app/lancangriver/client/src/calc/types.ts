export type SpherePoint = {
  x: number;
  y: number;
  z: number;
};

export type LatLng = {
  lat: number;
  lng: number;
};

export type SphereTileKey = {
  z: number;
  x: number;
  y: number;
};

export enum TileNodeState {
  init = 1,
  toCreate = 5,
  created = 10,
  toAttach = 15,
  attached = 20,
  toDetach = 50,
  detached = 60,
  toDispose = 70,
  disposed = 80,
}

export interface ITileNode {
  state: TileNodeState;
}
