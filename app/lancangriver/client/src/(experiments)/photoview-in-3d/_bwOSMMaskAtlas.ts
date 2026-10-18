import * as THREE from 'three';
import { EARTH_RADIUS } from '@/calc/constants';
import { LatLng, latLngToTileXY, tileMetersAtLatitude } from './_fns';
import { OSMSdfGenerator } from './_osmSdf';

// --- Width Scaling Constants for Tuning ---
export const DEFAULT_HIGHWAY_WIDTH_SCALE = 1.0;
export const DEFAULT_WATERWAY_WIDTH_SCALE = 1.0;
export const MIN_LINE_WIDTH_PIXELS = 1.0;

export const HIGHWAY_WIDTHS_METERS: Record<string, number> = {
  motorway: 16,
  motorway_link: 10,
  trunk: 14,
  trunk_link: 8,
  primary: 12,
  primary_link: 7,
  secondary: 9,
  secondary_link: 6,
  tertiary: 7,
  tertiary_link: 5,
  unclassified: 5,
  residential: 5,
  service: 4,
  living_street: 4,
  pedestrian: 4,
  footway: 3,
  path: 2.5,
  track: 3.5,
  default: 5,
};

export const WATERWAY_WIDTHS_METERS: Record<string, number> = {
  river: 24,
  canal: 14,
  stream: 6,
  drain: 4,
  ditch: 4,
  tidal_channel: 16,
  brook: 5,
  default: 8,
};

export type BwOSMMaskAtlasOptions = {
  centerX: number;
  centerY: number;
  centerLat?: number;
  expand?: number;
  zoom?: number;
  tilePixelSize?: number;
};

export type DrawLinesOptions = {
  widthScale?: number;
  widthTable?: Record<string, number>;
  defaultWidth?: number;
  propertyKey?: 'highway' | 'waterway' | string;
};

export class BwOSMMaskAtlas {
  readonly texture: THREE.DataTexture;
  readonly atlasData: Uint8Array;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly tilePixelSize: number;

  readonly minTileX: number;
  readonly minTileY: number;
  readonly cols: number;
  readonly rows: number;
  readonly zoom: number;
  readonly centerLat: number;

  readonly textureUniform: THREE.IUniform<THREE.Texture> = { value: null };

  readonly sdfTexture: THREE.DataTexture;
  readonly sdfData: Float32Array;
  readonly sdfTextureUniform: THREE.IUniform<THREE.Texture> = { value: null };
  private sdfGenerator: OSMSdfGenerator | null = null;

  private readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private isDisposed = false;

  constructor({
    centerX,
    centerY,
    centerLat = 0,
    expand = 2,
    zoom = 14,
    tilePixelSize = 256,
  }: BwOSMMaskAtlasOptions) {
    this.zoom = zoom;
    this.tilePixelSize = tilePixelSize;
    this.centerLat = centerLat;

    this.minTileX = centerX - expand;
    this.minTileY = centerY - expand;
    this.cols = expand * 2 + 1;
    this.rows = expand * 2 + 1;

    this.atlasWidth = this.cols * this.tilePixelSize;
    this.atlasHeight = this.rows * this.tilePixelSize;

    // Single-channel 1 byte per pixel
    this.atlasData = new Uint8Array(this.atlasWidth * this.atlasHeight);

    // Initialize 2D Canvas for global vector rasterization
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(this.atlasWidth, this.atlasHeight);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.atlasWidth;
      this.canvas.height = this.atlasHeight;
    }

    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Failed to create 2D canvas context for BwOSMMaskAtlas');
    }
    this.ctx = context as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    // Start with black background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.atlasWidth, this.atlasHeight);

    this.texture = new THREE.DataTexture(
      this.atlasData,
      this.atlasWidth,
      this.atlasHeight,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    this.textureUniform.value = this.texture;

    // Signed Distance Field texture (Float32 single-channel)
    this.sdfData = new Float32Array(this.atlasWidth * this.atlasHeight);
    this.sdfData.fill(9999.0);

    this.sdfTexture = new THREE.DataTexture(
      this.sdfData,
      this.atlasWidth,
      this.atlasHeight,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.sdfTexture.minFilter = THREE.LinearFilter;
    this.sdfTexture.magFilter = THREE.LinearFilter;
    this.sdfTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.sdfTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.sdfTexture.generateMipmaps = false;
    this.sdfTexture.needsUpdate = true;

    this.sdfTextureUniform.value = this.sdfTexture;
  }

  private getSdfGenerator(): OSMSdfGenerator {
    if (!this.sdfGenerator) {
      const metersPerTile = tileMetersAtLatitude(this.centerLat, this.zoom);
      const metersPerTexel = metersPerTile / this.tilePixelSize;
      this.sdfGenerator = new OSMSdfGenerator({
        width: this.atlasWidth,
        height: this.atlasHeight,
        metersPerTexel,
        rounds: 4,
      });
    }
    return this.sdfGenerator;
  }

  /**
   * Convert geographic (lat, lng) to pixel coordinate (px, py) on the full atlas canvas.
   * Top-left of canvas is (0, 0) corresponding to minTileX, minTileY (North-West).
   */
  latLngToAtlasPixel(lat: number, lng: number): { x: number; y: number } {
    const tileXY = latLngToTileXY(lat, lng, this.zoom);
    const x = (tileXY.x - this.minTileX) * this.tilePixelSize;
    const y = (tileXY.y - this.minTileY) * this.tilePixelSize;
    return { x, y };
  }

  /**
   * Clear canvas back to solid black and zero out atlasData.
   */
  clear(): void {
    if (this.isDisposed) return;
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.atlasWidth, this.atlasHeight);
    this.atlasData.fill(0);
    this.texture.needsUpdate = true;
    this.sdfData.fill(9999.0);
    this.sdfTexture.needsUpdate = true;
  }

  /**
   * Render Polygon and MultiPolygon GeoJSON features in solid white with hole support.
   */
  drawPolygons(collection: GeoJSON.FeatureCollection, fillStyle = '#ffffff'): void {
    if (this.isDisposed || !collection?.features) return;

    this.ctx.fillStyle = fillStyle;

    for (const feature of collection.features) {
      if (!feature.geometry) continue;

      const type = feature.geometry.type;
      let polygons: GeoJSON.Position[][][] = [];

      if (type === 'Polygon') {
        polygons = [(feature.geometry as GeoJSON.Polygon).coordinates];
      } else if (type === 'MultiPolygon') {
        polygons = (feature.geometry as GeoJSON.MultiPolygon).coordinates;
      } else {
        continue;
      }

      for (const rings of polygons) {
        if (rings.length === 0 || rings[0].length < 3) continue;

        this.ctx.beginPath();
        for (const ring of rings) {
          if (ring.length < 2) continue;
          const startPt = this.latLngToAtlasPixel(ring[0][1], ring[0][0]);
          this.ctx.moveTo(startPt.x, startPt.y);

          for (let i = 1; i < ring.length; i += 1) {
            const pt = this.latLngToAtlasPixel(ring[i][1], ring[i][0]);
            this.ctx.lineTo(pt.x, pt.y);
          }
          this.ctx.closePath();
        }
        // 'evenodd' rule naturally punches out holes defined by inner rings
        this.ctx.fill('evenodd');
      }
    }
  }

  /**
   * Render LineString and MultiLineString GeoJSON features with meter-scaled stroke widths.
   */
  drawLines(collection: GeoJSON.FeatureCollection, options: DrawLinesOptions = {}): void {
    if (this.isDisposed || !collection?.features) return;

    const {
      widthScale = 1.0,
      widthTable = HIGHWAY_WIDTHS_METERS,
      defaultWidth = 6,
      propertyKey,
    } = options;

    const metersPerTile = tileMetersAtLatitude(this.centerLat, this.zoom);
    const pixelsPerMeter = this.tilePixelSize / metersPerTile;

    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#ffffff';

    for (const feature of collection.features) {
      if (!feature.geometry) continue;

      const type = feature.geometry.type;
      let lineList: GeoJSON.Position[][] = [];

      if (type === 'LineString') {
        lineList = [(feature.geometry as GeoJSON.LineString).coordinates];
      } else if (type === 'MultiLineString') {
        lineList = (feature.geometry as GeoJSON.MultiLineString).coordinates;
      } else {
        continue;
      }

      const props = feature.properties || {};
      const categoryKey = propertyKey
        ? props[propertyKey]
        : props.highway || props.waterway || 'default';
      const baseWidthMeters = widthTable[categoryKey] ?? widthTable.default ?? defaultWidth;

      // Ensure stroke is at least 1.0 physical pixel so Canvas 2D maintains continuous 8-connectivity
      const strokePixels = Math.max(1.5, baseWidthMeters * pixelsPerMeter * widthScale);

      this.ctx.lineWidth = strokePixels;

      for (const line of lineList) {
        if (line.length < 2) continue;

        this.ctx.beginPath();
        const startPt = this.latLngToAtlasPixel(line[0][1], line[0][0]);
        this.ctx.moveTo(startPt.x, startPt.y);

        for (let i = 1; i < line.length; i += 1) {
          const pt = this.latLngToAtlasPixel(line[i][1], line[i][0]);
          this.ctx.lineTo(pt.x, pt.y);
        }
        this.ctx.stroke();
      }
    }
  }

  /**
   * Synchronize the 2D canvas pixels into WebGL DataTexture.
   * Flips Y row-by-row so canvas row 0 (North) maps to the highest V row in WebGL texture.
   * If a WebGLRenderer is provided, also updates the Signed Distance Field (SDF) texture.
   */
  flush(renderer?: THREE.WebGLRenderer): void {
    if (this.isDisposed) return;

    // Treat edge pixels along zone boundaries as outside
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.atlasWidth, 1);
    this.ctx.fillRect(0, this.atlasHeight - 1, this.atlasWidth, 1);
    this.ctx.fillRect(0, 0, 1, this.atlasHeight);
    this.ctx.fillRect(this.atlasWidth - 1, 0, 1, this.atlasHeight);

    const imgData = this.ctx.getImageData(0, 0, this.atlasWidth, this.atlasHeight).data;

    for (let cy = 0; cy < this.atlasHeight; cy += 1) {
      const dstY = this.atlasHeight - 1 - cy;
      const srcOffset = cy * this.atlasWidth * 4;
      const dstOffset = dstY * this.atlasWidth;

      for (let cx = 0; cx < this.atlasWidth; cx += 1) {
        // Red channel (0 for black, 255 for white)
        this.atlasData[dstOffset + cx] = imgData[srcOffset + cx * 4];
      }
    }

    this.texture.needsUpdate = true;

    if (renderer && !this.isDisposed) {
      this.computeSdf(renderer);
    }
  }

  /**
   * Execute GPU jump flooding algorithm to generate the signed distance field.
   */
  computeSdf(renderer: THREE.WebGLRenderer): void {
    if (this.isDisposed) return;
    const generator = this.getSdfGenerator();
    generator.computeSdf(renderer, this.texture, this.sdfData);
    this.sdfTexture.needsUpdate = true;
  }

  /**
   * Convert geographic lat/lng to normalized UV coordinate within the atlas [0, 1].
   */
  getMaskUv(lat: number, lng: number): { u: number; v: number } {
    const tileXY = latLngToTileXY(lat, lng, this.zoom);
    const u = (tileXY.x - this.minTileX) / this.cols;
    const v = 1.0 - (tileXY.y - this.minTileY) / this.rows;

    return {
      u: Math.min(1.0, Math.max(0.0, u)),
      v: Math.min(1.0, Math.max(0.0, v)),
    };
  }

  /**
   * Convert metric scene offset relative to worldCenter to normalized UV within the atlas.
   */
  getMaskUvFromOffset(x: number, z: number, worldCenterLatlng: LatLng): { u: number; v: number } {
    const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS;
    const metersPerDegLng = metersPerDegLat * Math.cos((worldCenterLatlng.lat * Math.PI) / 180);

    const lat = worldCenterLatlng.lat - z / metersPerDegLat;
    const lng = worldCenterLatlng.lng + x / metersPerDegLng;

    return this.getMaskUv(lat, lng);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.texture.dispose();
    this.sdfTexture.dispose();
    this.sdfGenerator?.dispose();
    this.sdfGenerator = null;
  }
}
