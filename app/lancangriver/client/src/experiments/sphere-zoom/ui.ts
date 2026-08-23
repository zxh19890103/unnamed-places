import * as THREE from "three";
import { BASE_URL } from "@/calc/constants.js";
import {
  EarthTile,
  latlngToSphere,
  normalizeLongitude,
  RAD_TO_DEG,
} from "@/_3dtiles";

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
        const point = latlngToSphere(lat, lng);

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

      return new THREE.Vector3().copy(latlngToSphere(lat, lng));
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
