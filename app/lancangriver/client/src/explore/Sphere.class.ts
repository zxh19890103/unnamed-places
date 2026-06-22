import * as THREE from "three";

import { EARTH_RADIUS } from "../calc/sphere";
import { SphereTile } from "./SphereTile.class";
import { latlngToTilekey } from "../calc/mercator";
import { SphereTileKey } from "../calc/types";
import { ControlMode } from "./ControlsManager.class";

export type SphereStatsPayload = {
  cameraDistanceMeters: number;
  zoomLevel: number;
  visibleTilesCount: number;
  controlMode: ControlMode;
};

export type SphereStatsEvent = Event & {
  type: "stats";
  payload: SphereStatsPayload;
};

declare module "three" {
  interface Object3DEventMap {
    stats: SphereStatsEvent;
  }
}

export class Sphere extends THREE.Group {
  readonly lods: Record<string, unknown> = {};
  readonly radius: number;

  private lastStats: SphereStatsPayload | null = null;

  constructor(
    readonly textureLoader: THREE.TextureLoader,
    radius = EARTH_RADIUS,
  ) {
    super();
    this.radius = radius;
  }

  private keyOf(tile: SphereTileKey): string {
    return `${tile.z}/${tile.x}/${tile.y}`;
  }

  createTileByKey(tile: SphereTileKey) {
    return new SphereTile(this.textureLoader, tile, {
      radius: this.radius,
    });
  }

  createTile(lon: number, lat: number, zoom: number) {
    const tilekey = latlngToTilekey(lon, lat, zoom);
    return this.createTileByKey(tilekey);
  }

  attachTile(tile: SphereTile) {
    this.add(tile);
    this.lods[this.keyOf(tile.tile)] = tile;
  }

  detachTile(tile: SphereTile) {
    this.remove(tile);
    delete this.lods[this.keyOf(tile.tile)];
  }

  dispatchStats(payload: SphereStatsPayload) {
    this.lastStats = payload;
    this.dispatchEvent({ type: "stats", payload } as SphereStatsEvent);
  }

  getStatsSnapshot() {
    return this.lastStats;
  }

  addStatsListener(listener: (event: SphereStatsEvent) => void) {
    this.addEventListener("stats", listener as EventListener);
  }

  removeStatsListener(listener: (event: SphereStatsEvent) => void) {
    this.removeEventListener("stats", listener as EventListener);
  }

  disposeTile(tile: SphereTile) {
    tile.geometry.dispose();

    if (Array.isArray(tile.material)) {
      for (const material of tile.material) {
        material.dispose();
      }
      return;
    }

    tile.material.dispose();
  }
}
