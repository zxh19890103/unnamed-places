import * as THREE from "three";

import { EARTH_RADIUS } from "../calc/constants";
import { SphereTile } from "./SphereTile.class";
import { SphereTileKey } from "./_types";
import { ControlMode, ControlsManager } from "./ControlsManager.class";
import type { TilesManager } from "./TilesManager.class";
import { latlngToStandardTileZxy, Create3dTilesViewer } from "@/_3dtiles";

export type SphereStatsPayload = {
  cameraDistanceMeters: number;
  zoomLevel: number;
  visibleTilesCount: number;
  controlMode: ControlMode;
  loadingLoaded: number;
  loadingTotal: number;
  loadingActive: boolean;
  loadingErrors: number;
  loadingLastErrorUrl: string | null;
  frameTimeP95Ms: number;
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

type SphereOptions = {
  radius?: number;
  camera: THREE.Camera;
  tilesManager: TilesManager;
  controlsManager: ControlsManager;
  getLoadingSnapshot: () => {
    loaded: number;
    total: number;
    active: boolean;
    errors: number;
    lastErrorUrl: string | null;
  };
};

export class Sphere extends THREE.Group {
  readonly lods: Record<string, unknown> = {};
  readonly radius: number;

  private lastStats: SphereStatsPayload | null = null;
  private _statsTimer: ReturnType<typeof setInterval> | null = null;
  private frameTimesMs: number[] = [];

  constructor(
    readonly threeTilesViewer: Create3dTilesViewer,
    readonly textureLoader: THREE.TextureLoader,
    readonly imageLoader: THREE.ImageLoader,
    options: SphereOptions,
  ) {
    super();
    const {
      radius = EARTH_RADIUS,
      camera,
      tilesManager,
      controlsManager,
      getLoadingSnapshot,
    } = options;

    this.radius = radius;

    this._statsTimer = setInterval(() => {
      const cameraDistanceMeters = camera.position.length() - EARTH_RADIUS;

      const zoomLevel =
        this.threeTilesViewer.distanceToZoom(cameraDistanceMeters);
      const loadingSnapshot = getLoadingSnapshot();

      this.dispatchStats({
        cameraDistanceMeters,
        zoomLevel,
        visibleTilesCount: tilesManager.getVisibleCount?.() ?? 0,
        controlMode: controlsManager.mode,
        loadingLoaded: loadingSnapshot.loaded,
        loadingTotal: loadingSnapshot.total,
        loadingActive: loadingSnapshot.active,
        loadingErrors: loadingSnapshot.errors,
        loadingLastErrorUrl: loadingSnapshot.lastErrorUrl,
        frameTimeP95Ms: this.getFrameTimeP95Ms(),
      });
    }, 1_000);
  }

  recordFrameTime(frameTimeMs: number) {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) {
      return;
    }

    this.frameTimesMs.push(frameTimeMs);
    if (this.frameTimesMs.length > 240) {
      this.frameTimesMs.shift();
    }
  }

  private getFrameTimeP95Ms() {
    if (this.frameTimesMs.length === 0) {
      return 0;
    }

    const sorted = [...this.frameTimesMs].sort((a, b) => a - b);
    const p95Index = Math.min(
      sorted.length - 1,
      Math.floor(sorted.length * 0.95),
    );

    return sorted[p95Index];
  }

  private keyOf(tile: SphereTileKey): string {
    return `${tile.z}/${tile.x}/${tile.y}`;
  }

  createTileByKey(tile: SphereTileKey) {
    return new SphereTile(this.textureLoader, this.imageLoader, tile, {
      radius: this.radius,
    });
  }

  createTile(lon: number, lat: number, zoom: number) {
    const tilekey = latlngToStandardTileZxy({ lat, lng: lon }, zoom);
    return this.createTileByKey({
      z: tilekey[0],
      x: tilekey[1],
      y: tilekey[2],
    });
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

  dispose() {
    if (this._statsTimer !== null) {
      clearInterval(this._statsTimer);
      this._statsTimer = null;
    }
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
