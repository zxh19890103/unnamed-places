import * as THREE from "three";

const EARTH_RADIUS = 6_371_008.8;

type EarthTileRuntime = {
  eyeAngle: number;
};

type LatLng = {
  /**
   * -90 ~ +90
   */
  lat: number;
  /**
   * -180 ~ +180
   */
  lng: number;
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function normalizeLongitude(lng: number): number {
  const wrapped = (((lng + 180) % 360) + 360) % 360;
  return wrapped - 180;
}

function latlngToStableColor(id: string): THREE.Color {
  // FNV-1a 32-bit hash so each tile id maps to a deterministic color.
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;

  const hue = (hash % 360) / 360;
  const saturation = 0.55 + ((hash >>> 8) % 20) / 100;
  const lightness = 0.45 + ((hash >>> 16) % 15) / 100;

  return new THREE.Color().setHSL(hue, saturation, lightness);
}

function latlngZoomToTileId(latlng: LatLng, zoom: number) {
  const zoomLevel = Math.max(0, Math.floor(zoom));
  const n = 2 ** zoomLevel;

  const normalizedLng = normalizeLongitude(latlng.lng);
  const clampedLat = THREE.MathUtils.clamp(latlng.lat, -90, 90);

  const rawX = Math.floor(((normalizedLng + 180) / 360) * n);
  const rawY = Math.floor(((90 - clampedLat) / 180) * n);

  const x = ((rawX % n) + n) % n;
  const y = THREE.MathUtils.clamp(rawY, 0, n - 1);

  return `eq:${zoomLevel}/${x}/${y}`;
}

export function latlngToSphere(
  lat: number,
  lng: number,
  radius = EARTH_RADIUS,
): THREE.Vector3Like {
  const latRad = lat * DEG_TO_RAD;
  const lngRad = lng * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);

  return {
    x: radius * cosLat * Math.sin(lngRad),
    y: radius * Math.sin(latRad),
    z: radius * cosLat * Math.cos(lngRad),
  };
}

export function sphereToLatlng(x: number, y: number, z: number): LatLng {
  const radius = Math.hypot(x, y, z);

  if (radius === 0) {
    throw new Error("sphereToLatlng requires a non-zero vector");
  }

  const lat = Math.asin(y / radius) * RAD_TO_DEG;
  const lng = Math.atan2(x, z) * RAD_TO_DEG;

  return { lat, lng: normalizeLongitude(lng) };
}

export class TileMesh extends THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshBasicMaterial
> {
  constructor(
    readonly tile: EarthTile,
    segments = 16,
  ) {
    const geometry = TileMesh.createGeometry(tile, segments);
    const material = new THREE.MeshBasicMaterial({
      color: latlngToStableColor(tile.id),
      wireframe: false,
      side: THREE.BackSide,
    });

    super(geometry, material);

    tile.mesh = this;
  }

  private static createGeometry(tile: EarthTile, segments: number) {
    const geometry = new THREE.BufferGeometry();
    const vertexCount = (segments + 1) * (segments + 1);
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices: number[] = [];

    const westLng = tile.southWest.lng;
    const eastLng = tile.northEast.lng;
    const southLat = tile.southWest.lat;
    const northLat = tile.northEast.lat;

    const lngSpan =
      eastLng >= westLng ? eastLng - westLng : eastLng + 360 - westLng;
    const latSpan = northLat - southLat;

    let vertexIndex = 0;
    for (let y = 0; y <= segments; y++) {
      const v = y / segments;
      const lat = southLat + latSpan * v;

      for (let x = 0; x <= segments; x++) {
        const u = x / segments;
        const lng = normalizeLongitude(westLng + lngSpan * u);
        const point = latlngToSphere(lat, lng, EARTH_RADIUS);

        positions[vertexIndex * 3 + 0] = point.x;
        positions[vertexIndex * 3 + 1] = point.y;
        positions[vertexIndex * 3 + 2] = point.z;

        uvs[vertexIndex * 2 + 0] = u;
        uvs[vertexIndex * 2 + 1] = 1 - v;

        vertexIndex++;
      }
    }

    for (let y = 0; y < segments; y++) {
      for (let x = 0; x < segments; x++) {
        const a = y * (segments + 1) + x;
        const b = a + 1;
        const c = a + (segments + 1);
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }
}

export class EarthTile {
  /**
   * the world position in meters.
   */
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;

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

  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  readonly volume: THREE.Box3;
  readonly isFlatEnough: boolean;

  readonly runtime: EarthTileRuntime;

  readonly id: string;

  constructor(
    readonly latlng: LatLng,
    readonly zoom: number,
  ) {
    this.position = new THREE.Vector3().copy(
      latlngToSphere(latlng.lat, latlng.lng, EARTH_RADIUS),
    );

    const n = 2 ** zoom;

    const latSpan = 180 / n;
    const lngSpan = 360 / n;

    this.southWest = {
      lat: latlng.lat - latSpan / 2,
      lng: latlng.lng - lngSpan / 2,
    };

    this.lb = new THREE.Vector3().copy(
      latlngToSphere(this.southWest.lat, this.southWest.lng, EARTH_RADIUS),
    );

    this.northEast = {
      lat: latlng.lat + latSpan / 2,
      lng: latlng.lng + lngSpan / 2,
    };

    this.rt = new THREE.Vector3().copy(
      latlngToSphere(this.northEast.lat, this.northEast.lng, EARTH_RADIUS),
    );

    this.normal = this.position.clone().normalize();

    this.volume = this.computeTileVolume();
    this.isFlatEnough = this.computeIsFlatEnough();

    this.runtime = {
      eyeAngle: 0,
    };

    this.id = latlngZoomToTileId(latlng, zoom);
  }

  private sampleTilePoints(gridSegments = 2): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];

    for (let iy = 0; iy <= gridSegments; iy++) {
      const tY = iy / gridSegments;
      const lat =
        this.southWest.lat + (this.northEast.lat - this.southWest.lat) * tY;

      for (let ix = 0; ix <= gridSegments; ix++) {
        const tX = ix / gridSegments;
        const lng =
          this.southWest.lng + (this.northEast.lng - this.southWest.lng) * tX;
        points.push(
          new THREE.Vector3().copy(latlngToSphere(lat, lng, EARTH_RADIUS)),
        );
      }
    }

    return points;
  }

  private computeTileVolume(): THREE.Box3 {
    const points = this.sampleTilePoints(2);
    const volume = new THREE.Box3().setFromPoints(points);

    // Expand slightly for robust frustum checks and numeric tolerance.
    const epsilonMeters = 1;
    volume.expandByScalar(epsilonMeters);

    return volume;
  }

  private computeIsFlatEnough(): boolean {
    const points = this.sampleTilePoints(2);

    let maxDeviation = 0;
    for (const point of points) {
      const signedDistance = this.normal.dot(point.clone().sub(this.position));
      const deviation = Math.abs(signedDistance);
      if (deviation > maxDeviation) {
        maxDeviation = deviation;
      }
    }

    const edgeLength = Math.max(
      this.lb.distanceTo(
        new THREE.Vector3().copy(
          latlngToSphere(this.southWest.lat, this.northEast.lng, EARTH_RADIUS),
        ),
      ),
      this.lb.distanceTo(
        new THREE.Vector3().copy(
          latlngToSphere(this.northEast.lat, this.southWest.lng, EARTH_RADIUS),
        ),
      ),
    );

    if (edgeLength === 0) {
      return true;
    }

    const flatnessFactor = maxDeviation / edgeLength;
    const flatnessThreshold = 0.002;
    return flatnessFactor <= flatnessThreshold;
  }

  isInFrustum(frustum: THREE.Frustum) {
    return frustum.intersectsBox(this.volume);
  }

  distanceFrom(target: THREE.Vector3): number {
    return this.volume.distanceToPoint(target);
  }

  /**
   * 1 - 4
   */
  subdivide(): EarthTile[] {
    const midLat = (this.southWest.lat + this.northEast.lat) / 2;
    const midLng = normalizeLongitude(
      (this.southWest.lng + this.northEast.lng) / 2,
    );

    const childLatSpan = (this.northEast.lat - this.southWest.lat) / 2;
    const childLngSpan = (this.northEast.lng - this.southWest.lng) / 2;

    const halfChildLatSpan = childLatSpan / 2;
    const halfChildLngSpan = childLngSpan / 2;

    // 2x2 children: SW, SE, NW, NE
    const southWestChild = new EarthTile(
      {
        lat: this.southWest.lat + halfChildLatSpan,
        lng: normalizeLongitude(this.southWest.lng + halfChildLngSpan),
      },
      this.zoom + 1,
    );

    const southEastChild = new EarthTile(
      {
        lat: this.southWest.lat + halfChildLatSpan,
        lng: normalizeLongitude(midLng + halfChildLngSpan),
      },
      this.zoom + 1,
    );

    const northWestChild = new EarthTile(
      {
        lat: midLat + halfChildLatSpan,
        lng: normalizeLongitude(this.southWest.lng + halfChildLngSpan),
      },
      this.zoom + 1,
    );

    const northEastChild = new EarthTile(
      {
        lat: midLat + halfChildLatSpan,
        lng: normalizeLongitude(midLng + halfChildLngSpan),
      },
      this.zoom + 1,
    );

    return [southWestChild, southEastChild, northWestChild, northEastChild];
  }
}
