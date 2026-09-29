import * as THREE from 'three';

import { BASE_URL } from '@/calc/constants.js';

import '@/styles.css';
import { DEG_TO_RAD } from '@/_3dtiles';

import {
  tileMetersAtLatitude,
  tileXYToLatLng,
  latLngToTileXY,
  fetchTileAltitude,
  latLngToMetersOffset,
} from './_fns';

type TileEvents = THREE.Object3DEventMap & {
  terrianReady: {};
};

export const TILE_ZOOM = 15;
export const THUMB_ELEVATION_ZOOM = 11;

export class TileGeometry extends THREE.BufferGeometry {
  constructor(size: number, segments = 256, skirt = 10) {
    super();

    const segmentCount = Math.max(1, Math.floor(segments));
    const halfSize = size / 2;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const addVertex = (x: number, y: number, z: number, u: number, v: number) => {
      positions.push(x, y, z);
      uvs.push(u, v);
    };

    for (let row = 0; row <= segmentCount; row += 1) {
      const z = -halfSize + (row / segmentCount) * size;

      for (let col = 0; col <= segmentCount; col += 1) {
        const x = -halfSize + (col / segmentCount) * size;
        const u = col / segmentCount;
        const v = 1.0 - row / segmentCount;

        addVertex(x, 0, z, u, v);
      }
    }

    for (let row = 0; row < segmentCount; row += 1) {
      for (let col = 0; col < segmentCount; col += 1) {
        const a = row * (segmentCount + 1) + col;
        const b = a + 1;
        const c = a + segmentCount + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    this.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    this.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    this.setIndex(indices);
    this.computeVertexNormals();
    this.computeBoundingSphere();
  }
}

export class Tile extends THREE.Group<TileEvents> {
  tileSizeMeters: number;
  expand: number;
  loadedWorldSizeMeters: number;
  loadedWorldSizeMeters0: number;

  constructor({ chip, zoom = 14, expand = 3 }: TileOptions) {
    super();

    const tileXY = latLngToTileXY(chip.lat, chip.lng, zoom);
    const centerX = Math.floor(tileXY.x);
    const centerY = Math.floor(tileXY.y);
    const tileSizeMeters = tileMetersAtLatitude(chip.lat, zoom);

    this.tileSizeMeters = tileSizeMeters;
    this.expand = expand;
    this.loadedWorldSizeMeters0 = tileSizeMeters * (expand + 1);
    this.loadedWorldSizeMeters = Math.sqrt(2 * Math.pow(tileSizeMeters * 2 * (expand + 1), 2)) / 2;

    const textureLoader = new THREE.TextureLoader();

    const elevationTileXY = latLngToTileXY(chip.lat, chip.lng, THUMB_ELEVATION_ZOOM);
    const elevationTileX = Math.floor(elevationTileXY.x);
    const elevationTileY = Math.floor(elevationTileXY.y);
    const demMinPromise = fetchTileAltitude(THUMB_ELEVATION_ZOOM, elevationTileX, elevationTileY)
      .then((altitude) => altitude.avg)
      .catch(() => 0);

    const xyMax = 2 ** zoom - 1;

    const box = new THREE.Box3();
    this.box = box;

    for (let row = -expand; row <= expand; row += 1) {
      for (let col = -expand; col <= expand; col += 1) {
        const x = centerX + col;
        const y = centerY + row;

        if (x < 0 || x > xyMax || y < 0 || y > xyMax) {
          continue;
        }

        const tileCenter = tileXYToLatLng(x + 0.5, y + 0.5, zoom);
        const offset = latLngToMetersOffset(tileCenter.lat, tileCenter.lng, chip.lat, chip.lng);

        const satelliteUrl = `${BASE_URL}/raster/satellite/${zoom}/${x}/${y}.jpeg`;
        const satelliteTexture = textureLoader.load(satelliteUrl);
        satelliteTexture.colorSpace = THREE.NoColorSpace;
        satelliteTexture.minFilter = THREE.LinearFilter;
        satelliteTexture.magFilter = THREE.LinearFilter;

        const demUrl = `${BASE_URL}/raster/dem/${zoom}/${x}/${y}.png`;
        const demTexture = textureLoader.load(demUrl);
        demTexture.minFilter = THREE.LinearFilter;
        demTexture.magFilter = THREE.LinearFilter;

        const material = new THREE.ShaderMaterial({
          uniforms: {
            satelliteTexture: { value: satelliteTexture },
            demTexture: { value: demTexture },
            demMin: { value: 0 },
            saturation: { value: 1 },
            contrast: { value: 1 },
          },
          vertexShader: tileVertexShader,
          fragmentShader: tileFragmentShader,
          side: THREE.FrontSide,
          transparent: false,
        });

        demMinPromise.then((demMin) => {
          material.uniforms.demMin.value = demMin;
          material.uniformsNeedUpdate = true;
        });

        const geometry = new TileGeometry(tileSizeMeters);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(offset.x, 0, offset.z);
        box.expandByObject(mesh);

        mesh.userData = { tile: { z: zoom, x, y } };
        this.add(mesh);
      }
    }

    const outerWorldPlane = new THREE.PlaneGeometry(
      this.loadedWorldSizeMeters * 4,
      this.loadedWorldSizeMeters * 4,
      1,
      1,
    );
    outerWorldPlane.rotateX(-90 * DEG_TO_RAD);
    outerWorldPlane.computeBoundingBox();

    const walkingPathFromBox = (path: THREE.Path, box: THREE.Box3) => {
      const pt = new THREE.Vector2();
      const pt0 = new THREE.Vector2();
      const pt1 = new THREE.Vector2();
      const n = 80;

      pt0.set(box.min.x, box.min.z);
      path.moveTo(pt0.x, pt0.y);

      pt1.set(box.min.x, box.max.z);
      for (let a = 0; a <= n; a++) {
        pt.lerpVectors(pt0, pt1, a / n);
        path.lineTo(pt.x, pt.y);
      }
      pt0.copy(pt1);

      pt1.set(box.max.x, box.max.z);
      for (let a = 0; a <= n; a++) {
        pt.lerpVectors(pt0, pt1, a / n);
        path.lineTo(pt.x, pt.y);
      }
      pt0.copy(pt1);

      pt1.set(box.max.x, box.min.z);
      for (let a = 0; a <= n; a++) {
        pt.lerpVectors(pt0, pt1, a / n);
        path.lineTo(pt.x, pt.y);
      }
      pt0.copy(pt1);
      path.closePath();
    };

    const outerWorld = new THREE.Shape();
    walkingPathFromBox(outerWorld, outerWorldPlane.boundingBox);
    const innerWorld = new THREE.Shape();
    walkingPathFromBox(innerWorld, box);

    outerWorld.holes.push(innerWorld);
    const worldGeometry = new THREE.ShapeGeometry(outerWorld);
    worldGeometry.rotateX(-90 * DEG_TO_RAD);
    worldGeometry.translate(0, -100, -1700);
    worldGeometry.scale(0.5, 1, 0.5);

    const planeMesh = new THREE.Mesh(
      worldGeometry,
      new THREE.ShaderMaterial({
        uniforms: {
          terrainMap: {
            value: new THREE.TextureLoader().load(`/perlin-noise-rgb-256x256.png`),
          },
          skipMin: {
            value: box.min,
          },
          skipMax: {
            value: box.max,
          },
        },
        vertexShader: /*glsl */ `
        varying vec2 vUv;
        varying float vAlt;
        
        uniform vec3 skipMin;
        uniform vec3 skipMax;

        uniform sampler2D terrainMap;

        varying float vSkip;

        void main() {
          vUv = uv;
          vec3 displaced = position;

          float demRgb = length(texture2D(terrainMap, uv).rg);
          float alt = -300.0 + 700.0 * sin(demRgb * 10.0);
          vAlt = alt;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
        `,
        wireframe: true,
        fragmentShader: /*glsl */ `
        varying vec2 vUv;
        varying float vAlt;

        void main() {
          gl_FragColor = vec4(0.6, 0.8, 0.9, 1.0);
        }
        `,
      }),
    );

    planeMesh.visible = false;
    this.add(planeMesh);
  }

  box: THREE.Box3;
}

export type LatLng = { lat: number; lng: number };

type TileOptions = {
  chip: LatLng;
  zoom?: number;
  expand?: number;
};

export function disposeTile(tile: THREE.Group | null) {
  if (!tile) return;
  tile.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshBasicMaterial && material.map) {
          material.map.dispose();
        }
        material.dispose();
      });
    }
  });
  tile.parent?.remove(tile);
}

const glsl_funcs = `

// 1. BRIGHTNESS
// u_brightness: 0.0 = black, 1.0 = normal, >1.0 = brighter
vec3 applyBrightness(vec3 color, float u_brightness) {
    return color * u_brightness;
}

// 2. SATURATION
// u_saturation: 0.0 = grayscale, 1.0 = normal, >1.0 = vibrant
vec3 applySaturation(vec3 color, float u_saturation) {
    // Rec. 709 luminance weights for human vision perception
    const vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);
    float luminance = dot(color, luminanceWeights);
    return mix(vec3(luminance), color, u_saturation);
}

// 3. CONTRAST
// u_contrast: 0.0 = flat gray, 1.0 = normal, >1.0 = high contrast
vec3 applyContrast(vec3 color, float u_contrast) {
    const vec3 midGray = vec3(0.5);
    return mix(midGray, color, u_contrast);
}

`;

const tileVertexShader = `
  uniform sampler2D demTexture;
  uniform float demMin;
  varying vec2 vUv;

  float decodeElevation(vec3 color) {
    return color.r * 256.0 + color.g + color.b / 256.0 - 32768.0;
  }

  void main() {
    vUv = uv;
    vec3 demRgb = texture2D(demTexture, uv).rgb * 255.0;
    float elevation = decodeElevation(demRgb);
    float raise = elevation - demMin;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    worldPosition.y += raise;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const tileFragmentShader = `
  uniform sampler2D satelliteTexture;
  uniform float brightness;
  uniform float saturation;
  uniform float contrast;

  varying vec2 vUv;

${glsl_funcs}

  void main() {
    vec4 color = texture2D(satelliteTexture, vUv);
    vec3 finalColor = applySaturation( color.rgb,  saturation);
    finalColor = applyContrast( finalColor,  contrast);
    gl_FragColor = vec4(finalColor, 1.0) ;
  }
`;
