import * as THREE from "three";
import { shortestDistanceToCap } from "./cap";
import { BASE_URL } from "../../calc/constants";

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
const WEB_MERCATOR_MAX_LAT = 85.05112878;

function normalizeLongitude(lng: number): number {
  const wrapped = (((lng + 180) % 360) + 360) % 360;
  return wrapped - 180;
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

class EarthTileOutlineMaterial extends THREE.ShaderMaterial {
  constructor(edgeWidth = 0.02, tile: EarthTile) {
    super({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      uniforms: {
        uColor: {
          value: new THREE.Color(tile.isFlatEnough ? 0xef0a90 : 0xffffff),
        },
        uEdgeWidth: { value: edgeWidth },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uEdgeWidth;

        void main() {
          bool isEdge =
            vUv.x <= uEdgeWidth ||
            vUv.x >= (1.0 - uEdgeWidth) ||
            vUv.y <= uEdgeWidth ||
            vUv.y >= (1.0 - uEdgeWidth);

          if (!isEdge) {
            discard;
          }

          gl_FragColor = vec4(uColor, 1.0);
        }
      `,
    });
  }
}

class EarthTileImageryMaterial extends THREE.ShaderMaterial {
  private pendingImage: HTMLImageElement | null = null;

  constructor(tile: EarthTile) {
    const url = `${BASE_URL}/raster/satellite/${tile.z}/${tile.x}/${tile.y}.jpeg`;

    super({
      uniforms: {
        uSatelliteTexture: { value: null },
        uTextureReady: { value: 0 },
        uFallbackColor: {
          value: new THREE.Color(tile.isFlatEnough ? 0xef0a90 : 0x3b4252),
        },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uSatelliteTexture;
        uniform float uTextureReady;
        uniform vec3 uFallbackColor;

        void main() {
          if (uTextureReady < 0.5) {
            gl_FragColor = vec4(uFallbackColor, 1.0);
            return;
          }

          gl_FragColor = texture2D(uSatelliteTexture, vUv);
        }
      `,
    });

    let satelliteTexture: THREE.Texture | null = null;
    const imageLoader = new THREE.ImageLoader();

    this.pendingImage = imageLoader.load(
      url,
      (image) => {
        if (!this.pendingImage) {
          return;
        }

        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          this.pendingImage = null;
          return;
        }

        satelliteTexture = new THREE.Texture();
        satelliteTexture.image = image;
        satelliteTexture.needsUpdate = true;
        this.uniforms.uSatelliteTexture.value = satelliteTexture;
        this.uniforms.uTextureReady.value = 1;

        this.pendingImage = null;
      },
      undefined,
      () => {
        this.pendingImage = null;
      },
    );
  }

  override dispose(): void {
    if (this.pendingImage) {
      this.pendingImage.onload = null;
      this.pendingImage.onerror = null;
      this.pendingImage.src = "";
      this.pendingImage = null;
    }

    const satelliteTexture = this.uniforms.uSatelliteTexture.value;
    if (satelliteTexture instanceof THREE.Texture) {
      satelliteTexture.dispose();
    }

    super.dispose();
  }
}

export class TileMesh extends THREE.Mesh<
  THREE.BufferGeometry,
  EarthTileImageryMaterial
> {
  constructor(
    readonly tile: EarthTile,
    segments = 16,
  ) {
    const geometry = TileMesh.createGeometry(tile, segments);
    const material = new EarthTileImageryMaterial(tile);

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
    const n = 2 ** tile.z;
    const northMercatorY = Math.PI * (1 - (2 * tile.y) / n);
    const southMercatorY = Math.PI * (1 - (2 * (tile.y + 1)) / n);

    const lngSpan =
      eastLng >= westLng ? eastLng - westLng : eastLng + 360 - westLng;

    let vertexIndex = 0;
    for (let y = 0; y <= segments; y++) {
      const v = y / segments;
      const mercatorY = northMercatorY + (southMercatorY - northMercatorY) * v;
      const lat = Math.atan(Math.sinh(mercatorY)) * RAD_TO_DEG;

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

  dispose() {
    this.geometry.dispose();
    this.material.dispose();

    if (this.tile.volumeHelper) {
      const volumeHelper = this.tile.volumeHelper;
      volumeHelper.geometry.dispose();
      const helperMaterial = volumeHelper.material;
      if (Array.isArray(helperMaterial)) {
        for (const material of helperMaterial) {
          material.dispose();
        }
      } else {
        helperMaterial.dispose();
      }

      this.tile.volumeHelper = null;
    }
  }
}

export class TileOutline extends THREE.LineLoop<
  THREE.BufferGeometry,
  THREE.LineBasicMaterial
> {
  constructor(
    readonly tile: EarthTile,
    segments = 16,
  ) {
    const geometry = TileOutline.createGeometry(tile, segments);
    const material = new THREE.LineBasicMaterial({
      color: tile.isFlatEnough ? 0xef0a90 : 0xffffff,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    super(geometry, material);

    this.frustumCulled = false;
  }

  private static createGeometry(tile: EarthTile, segments: number) {
    const safeSegments = Math.max(1, Math.floor(segments));
    const points: THREE.Vector3[] = [];

    const westLng = tile.southWest.lng;
    const eastLng = tile.northEast.lng;
    const n = 2 ** tile.z;
    const northMercatorY = Math.PI * (1 - (2 * tile.y) / n);
    const southMercatorY = Math.PI * (1 - (2 * (tile.y + 1)) / n);
    const lngSpan =
      eastLng >= westLng ? eastLng - westLng : eastLng + 360 - westLng;

    const pointAt = (u: number, v: number) => {
      const mercatorY = northMercatorY + (southMercatorY - northMercatorY) * v;
      const lat = Math.atan(Math.sinh(mercatorY)) * RAD_TO_DEG;
      const lng = normalizeLongitude(westLng + lngSpan * u);

      return new THREE.Vector3().copy(latlngToSphere(lat, lng, EARTH_RADIUS));
    };

    for (let x = 0; x <= safeSegments; x++) {
      points.push(pointAt(x / safeSegments, 0));
    }

    for (let y = 1; y <= safeSegments; y++) {
      points.push(pointAt(1, y / safeSegments));
    }

    for (let x = safeSegments - 1; x >= 0; x--) {
      points.push(pointAt(x / safeSegments, 1));
    }

    for (let y = safeSegments - 1; y >= 1; y--) {
      points.push(pointAt(0, y / safeSegments));
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

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

  mesh: TileMesh;
  outline: TileOutline;
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
      latlngToSphere(this.southWest.lat, this.southWest.lng, EARTH_RADIUS),
    );

    this.northEast = northEast;

    this.rt = new THREE.Vector3().copy(
      latlngToSphere(this.northEast.lat, this.northEast.lng, EARTH_RADIUS),
    );

    this.position = new THREE.Vector3().copy(
      latlngToSphere(centerLatlng.lat, centerLatlng.lng, EARTH_RADIUS),
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
      latlngToSphere(this.northEast.lat, this.southWest.lng, EARTH_RADIUS),
    );

    const southEast = new THREE.Vector3().copy(
      latlngToSphere(this.southWest.lat, this.northEast.lng, EARTH_RADIUS),
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

function latlngToStandardTileZxy(
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

function tileZxyToCenterLatlng(z: number, x: number, y: number) {
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
