import * as THREE from "three";
import { shortestDistanceToCap } from "./cap";
import {
  DEG_TO_RAD,
  EARTH_RADIUS,
  EarthTileRuntime,
  LatLng,
  latlngToSphere,
  normalizeLongitude,
  RAD_TO_DEG,
  WEB_MERCATOR_MAX_LAT,
} from "./core";

export class EarthTile {
  readonly latlng: LatLng;
  readonly z: number;
  readonly x: number;
  readonly y: number;

  /**
   * the world position in meters.
   */
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;

  private capHalfAngleRad: number;

  /**
   * min
   */
  readonly southWest: LatLng;
  readonly lb: THREE.Vector3;
  /**
   * max
   */
  readonly northEast: LatLng;
  readonly rt: THREE.Vector3;

  mesh: THREE.Mesh;
  outline: THREE.LineLoop;
  volumeHelper: THREE.Box3Helper | null = null;

  readonly volume: THREE.Box3;
  readonly isFlatEnough: boolean;

  readonly runtime: EarthTileRuntime;

  readonly id: string;

  constructor(
    latlng: LatLng,
    readonly zoom: number,
    id: string,
    zxy?: [number, number, number],
  ) {
    const [z, x, y] = zxy ?? latlngToStandardTileZxy(latlng, zoom);
    const centerLatlng = tileZxyToCenterLatlng(z, x, y);
    const southWest = tileZxyToSouthWestLatlng(z, x, y);
    const northEast = tileZxyToNorthEastLatlng(z, x, y);

    this.id = id;
    this.z = z;
    this.x = x;
    this.y = y;
    this.latlng = centerLatlng;

    this.southWest = southWest;

    this.lb = new THREE.Vector3().copy(
      latlngToSphere(this.southWest.lat, this.southWest.lng),
    );

    this.northEast = northEast;

    this.rt = new THREE.Vector3().copy(
      latlngToSphere(this.northEast.lat, this.northEast.lng),
    );

    this.position = new THREE.Vector3().copy(
      latlngToSphere(centerLatlng.lat, centerLatlng.lng),
    );

    this.normal = this.position.clone().normalize();

    this.computeHalfCapAngle();

    this.volume = this.computeTileVolume();
    this.isFlatEnough = this.computeIsFlatEnough();

    this.runtime = {
      eyeAngle: 0,
    };
  }

  private computeHalfCapAngle() {
    const northWest = new THREE.Vector3().copy(
      latlngToSphere(this.northEast.lat, this.southWest.lng),
    );

    const southEast = new THREE.Vector3().copy(
      latlngToSphere(this.southWest.lat, this.northEast.lng),
    );

    const corners = [this.lb, this.rt, northWest, southEast];
    let maxCornerAngle = 0;
    for (const corner of corners) {
      const cosTheta = THREE.MathUtils.clamp(
        this.normal.dot(corner) / EARTH_RADIUS,
        -1,
        1,
      );
      const theta = Math.acos(cosTheta);
      if (theta > maxCornerAngle) {
        maxCornerAngle = theta;
      }
    }

    this.capHalfAngleRad = maxCornerAngle;
  }

  private computeTileVolume(): THREE.Box3 {
    return null;
  }

  private computeIsFlatEnough(): boolean {
    return this.zoom > 8;
  }

  isInFrustum(frustum: THREE.Frustum) {
    for (const plane of frustum.planes) {
      const normalLen = plane.normal.length();
      if (normalLen === 0) {
        continue;
      }

      const cosBeta = THREE.MathUtils.clamp(
        plane.normal.dot(this.normal) / normalLen,
        -1,
        1,
      );
      const beta = Math.acos(cosBeta);
      const angularDelta = Math.max(0, beta - this.capHalfAngleRad);

      // Maximum signed distance from this spherical cap to the current plane.
      const maxSignedDistance =
        EARTH_RADIUS * normalLen * Math.cos(angularDelta) + plane.constant;

      if (maxSignedDistance < 0) {
        return false;
      }
    }

    return true;
  }

  distanceTo(target: THREE.Vector3): number {
    return shortestDistanceToCap(
      EARTH_RADIUS,
      [0, 0, 0],
      this.normal.toArray(),
      this.capHalfAngleRad,
      target.toArray(),
    );
  }
}

export function latlngToStandardTileZxy(
  latlng: LatLng,
  zoom = 0,
): [number, number, number] {
  const n = 2 ** zoom;

  const lng = normalizeLongitude(latlng.lng);
  const lat = THREE.MathUtils.clamp(
    latlng.lat,
    -WEB_MERCATOR_MAX_LAT,
    WEB_MERCATOR_MAX_LAT,
  );
  const latRad = lat * DEG_TO_RAD;

  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );

  return [
    zoom,
    THREE.MathUtils.clamp(x, 0, n - 1),
    THREE.MathUtils.clamp(y, 0, n - 1),
  ];
}

export function tileZxyToCenterLatlng(z: number, x: number, y: number) {
  const n = 2 ** z;
  const clampedX = THREE.MathUtils.clamp(Math.floor(x), 0, n - 1);
  const clampedY = THREE.MathUtils.clamp(Math.floor(y), 0, n - 1);

  const lng = ((clampedX + 0.5) / n) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * (clampedY + 0.5)) / n);
  const lat = Math.atan(Math.sinh(mercatorY)) * RAD_TO_DEG;

  return { lat, lng: normalizeLongitude(lng) } as LatLng;
}

function tileZxyToSouthWestLatlng(z: number, x: number, y: number) {
  const n = 2 ** z;
  const clampedX = THREE.MathUtils.clamp(Math.floor(x), 0, n - 1);
  const clampedY = THREE.MathUtils.clamp(Math.floor(y), 0, n - 1);

  const lng = (clampedX / n) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * (clampedY + 1)) / n);
  const lat = Math.atan(Math.sinh(mercatorY)) * RAD_TO_DEG;

  return { lat, lng: normalizeLongitude(lng) } as LatLng;
}

function tileZxyToNorthEastLatlng(z: number, x: number, y: number) {
  const n = 2 ** z;
  const clampedX = THREE.MathUtils.clamp(Math.floor(x), 0, n - 1);
  const clampedY = THREE.MathUtils.clamp(Math.floor(y), 0, n - 1);

  const lng = ((clampedX + 1) / n) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * clampedY) / n);
  const lat = Math.atan(Math.sinh(mercatorY)) * RAD_TO_DEG;

  return { lat, lng: normalizeLongitude(lng) } as LatLng;
}

function keyOfTile(z: number, x: number, y: number) {
  return `${z}/${x}/${y}`;
}

export class EarthTilesManager {
  private tileCache: Map<string, EarthTile> = new Map();

  /**
   * tiles that are rendered.
   */
  tiles: EarthTile[] = [];

  tilesToAdd: EarthTile[];
  tilesToRemove: EarthTile[];

  create(latlng: LatLng, zoom: number): EarthTile {
    const [z, x, y] = latlngToStandardTileZxy(latlng, zoom);
    const key = keyOfTile(z, x, y);
    const cached = this.tileCache.get(key);
    if (cached) {
      return cached;
    }

    const tile = new EarthTile(latlng, zoom, key, [z, x, y]);
    this.tileCache.set(key, tile);
    return tile;
  }

  createZxy(z: number, x: number, y: number) {
    const key = keyOfTile(z, x, y);
    const cached = this.tileCache.get(key);
    if (cached) {
      return cached;
    }

    const tileCenter = tileZxyToCenterLatlng(z, x, y);
    const tile = new EarthTile(tileCenter, z, key, [z, x, y]);
    this.tileCache.set(key, tile);
    return tile;
  }

  /**
   * 1. diff,
   * 2. generate toadd, and toremove
   */
  replace(nextTiles: EarthTile[]) {
    const tilesToAdd: EarthTile[] = [];
    const tilesToRemove: EarthTile[] = [];
    const tilesToKeep: EarthTile[] = [];

    const currentById = new Map(this.tiles.map((tile) => [tile.id, tile]));
    const nextSeenIds = new Set<string>();

    for (const tile of nextTiles) {
      if (nextSeenIds.has(tile.id)) {
        continue;
      }

      nextSeenIds.add(tile.id);
      const existing = currentById.get(tile.id);

      if (existing) {
        tilesToKeep.push(existing);
      } else {
        tilesToAdd.push(tile);
      }
    }

    for (const tile of this.tiles) {
      if (!nextSeenIds.has(tile.id)) {
        tilesToRemove.push(tile);
      }
    }

    this.tilesToAdd = tilesToAdd;
    this.tilesToRemove = tilesToRemove;
    this.tiles = [...tilesToAdd, ...tilesToKeep];
  }

  /**
   * 1 - 4
   */
  subdivide(tile: EarthTile): EarthTile[] {
    const childZ = tile.z + 1;
    const childX = tile.x * 2;
    const childY = tile.y * 2;

    // 2x2 children in Web Mercator z/x/y: NW, NE, SW, SE
    const northWestChild = this.createZxy(childZ, childX, childY);
    const northEastChild = this.createZxy(childZ, childX + 1, childY);
    const southWestChild = this.createZxy(childZ, childX, childY + 1);
    const southEastChild = this.createZxy(childZ, childX + 1, childY + 1);

    return [southWestChild, southEastChild, northWestChild, northEastChild];
  }
}
