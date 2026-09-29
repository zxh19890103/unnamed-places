import * as THREE from 'three';
import { BASE_URL, EARTH_RADIUS } from '@/calc/constants.js';
import '@/styles.css';

import {
  tileMetersAtLatitude,
  fetchTileAltitude,
  latLngToMetersOffset,
  tileXYToLatLng,
  latLngToTileXY,
} from './_fns';

type ApronOptions = {
  chip: LatLng;
  innerRadiusMeters: number;
  outerRadiusMeters: number;
};

type LatLng = { lat: number; lng: number };

const APRON_ZOOM = 11;

export class TerrainApron extends THREE.Group {
  constructor({ chip, innerRadiusMeters, outerRadiusMeters }: ApronOptions) {
    super();

    const tileXY = latLngToTileXY(chip.lat, chip.lng, APRON_ZOOM);
    const tileX = Math.floor(tileXY.x);
    const tileY = Math.floor(tileXY.y);

    Promise.all([
      fetchTileAltitude(APRON_ZOOM, tileX, tileY).catch(() => ({ avg: 0 })),
      new Promise<HTMLImageElement>((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
          `${BASE_URL}/raster/dem/${APRON_ZOOM}/${tileX}/${tileY}.png`,
          (texture) => resolve(texture.image as HTMLImageElement),
          undefined,
          reject,
        );
      }).catch(() => null),
    ]).then(([altitude, image]) => {
      let imageData: ImageData | null = null;
      if (image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(image, 0, 0);
          imageData = ctx.getImageData(0, 0, image.width, image.height);
        }
      }

      const innerElevationOffset = altitude.avg;
      const segments = 128;
      const rings = 24;
      const geometry = new THREE.PlaneGeometry(
        outerRadiusMeters * 2,
        outerRadiusMeters * 2,
        segments,
        rings,
      );
      geometry.rotateX(-Math.PI / 2);

      const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;
      const colors: number[] = [];

      const tileSizeMeters = tileMetersAtLatitude(chip.lat, APRON_ZOOM);
      const tileCenter = tileXYToLatLng(tileX + 0.5, tileY + 0.5, APRON_ZOOM);
      const tileCenterOffset = latLngToMetersOffset(
        tileCenter.lat,
        tileCenter.lng,
        chip.lat,
        chip.lng,
      );

      const lowColor = new THREE.Color(0x8b7d6b);
      const midColor = new THREE.Color(0x6b8c42);
      const highColor = new THREE.Color(0x5a6e5c);
      const waterColor = new THREE.Color(0x6e8c9e);

      for (let i = 0; i < positionAttribute.count; i += 1) {
        const px = positionAttribute.getX(i);
        const pz = positionAttribute.getZ(i);
        const distance = Math.sqrt(px * px + pz * pz);

        const worldX = px + tileCenterOffset.x;
        const worldZ = pz + tileCenterOffset.z;
        const worldLat = chip.lat - worldZ / ((Math.PI / 180) * EARTH_RADIUS);
        const metersPerDegLng =
          (Math.PI / 180) * EARTH_RADIUS * Math.cos((chip.lat * Math.PI) / 180);
        const worldLng = chip.lng + worldX / metersPerDegLng;

        const localTileXY = latLngToTileXY(worldLat, worldLng, APRON_ZOOM);
        const localU = localTileXY.x - tileX;
        const localV = 1 - (localTileXY.y - tileY);

        let elevation: number;
        if (imageData && localU >= 0 && localU <= 1 && localV >= 0 && localV <= 1) {
          const pixel = sampleDemPixel(imageData, localU, localV);
          elevation = decodeElevation(pixel);
        } else {
          const nx = worldX / tileSizeMeters;
          const ny = worldZ / tileSizeMeters;
          elevation = innerElevationOffset + fbm(nx, ny) * 60 - 20;
        }

        const innerEdge = innerRadiusMeters;
        const blendWidth = tileSizeMeters * 0.5;
        let finalElevation = elevation;
        if (distance < innerEdge + blendWidth) {
          const t = Math.min(1, Math.max(0, (distance - innerEdge) / blendWidth));
          finalElevation = innerElevationOffset * (1 - t) + elevation * t;
        }

        positionAttribute.setY(i, finalElevation * 1.6);

        const neighborDistance = outerRadiusMeters / rings;
        const nextIndex = Math.min(i + segments + 1, positionAttribute.count - 1);
        const prevIndex = Math.max(i - (segments + 1), 0);
        const dyNext = positionAttribute.getY(nextIndex) - finalElevation * 1.6;
        const dyPrev = positionAttribute.getY(prevIndex) - finalElevation * 1.6;
        const slope = Math.min(1, Math.sqrt(dyNext * dyNext + dyPrev * dyPrev) / neighborDistance);

        const normalizedHeight = Math.min(
          1,
          Math.max(0, (finalElevation - innerElevationOffset + 50) / 250),
        );
        const baseColor = new THREE.Color().lerpColors(
          waterColor,
          midColor,
          Math.min(1, normalizedHeight * 2),
        );
        baseColor.lerp(highColor, Math.max(0, normalizedHeight - 0.5) * 2);
        baseColor.lerp(lowColor, slope * 0.6);

        colors.push(baseColor.r, baseColor.g, baseColor.b);
      }

      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      this.add(mesh);
    });
  }
}

function fbm(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let max = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += amplitude * noise2d(x * frequency, y * frequency);
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / max;
}

function sampleDemPixel(
  imageData: ImageData,
  u: number,
  v: number,
): { r: number; g: number; b: number } {
  const width = imageData.width;
  const height = imageData.height;
  const x = Math.max(0, Math.min(width - 1, Math.floor(u * width)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(v * height)));
  const index = (y * width + x) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
  };
}

function decodeElevation(color: { r: number; g: number; b: number }): number {
  return color.r * 256 + color.g + color.b / 256 - 32768;
}

function hash2d(x: number, y: number): number {
  const sin = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return sin - Math.floor(sin);
}

function noise2d(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2d(ix, iy);
  const b = hash2d(ix + 1, iy);
  const c = hash2d(ix, iy + 1);
  const d = hash2d(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
