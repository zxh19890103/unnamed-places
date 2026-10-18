import * as THREE from 'three';

import { BASE_URL } from '@/calc/constants.js';

import '@/styles.css';

import {
  tileMetersAtLatitude,
  tileXYToLatLng,
  latLngToTileXY,
  fetchTileAltitude,
  latLngToMetersOffset,
} from './_fns';
import { __glsl_funcs__ } from './_glsl';
import { loadProcessedDem, createDemDataTexture } from './_demDecode';
import { DemAtlas } from './_demAtlas';
import { SatelliteAtlas } from './_satelliteAtlas';
import { BwOSMMaskAtlas } from './_bwOSMMaskAtlas';
import { SolarUniforms } from './_solar.js';
import { CloudShadowUniforms, noiseGlsl } from './_cloud.js';

type TileEvents = THREE.Object3DEventMap & {
  terrianReady: {};
};

const MAX_ZOOM = 20;

export const TILE_ZOOM = 15;
export const THUMB_ELEVATION_ZOOM = 11;
export const USE_CPU_DEM = true;
export const DEM_CLAMP_THRESHOLD_METERS = 1500;

const distToZoomLevel = (dist: number) => {
  const raw = Math.floor(Math.log2(56_000_000 / dist));
  if (Number.isNaN(raw)) return 0;
  const zoom = Math.max(0, Math.min(raw, MAX_ZOOM));
  return zoom;
};

export class TileGeometry extends THREE.BufferGeometry {
  constructor(size: number, segments = 128, skirt = 10) {
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

    if (skirt > 0) {
      const rowStride = segmentCount + 1;
      const gridIndex = (row: number, col: number) => row * rowStride + col;

      // Closed perimeter loop ordered so skirt walls face outward (N → W → S → E).
      const perimeter: number[] = [];
      for (let col = segmentCount; col > 0; col -= 1) perimeter.push(gridIndex(0, col));
      for (let row = 0; row < segmentCount; row += 1) perimeter.push(gridIndex(row, 0));
      for (let col = 0; col < segmentCount; col += 1) perimeter.push(gridIndex(segmentCount, col));
      for (let row = segmentCount; row > 0; row -= 1) perimeter.push(gridIndex(row, segmentCount));

      const skirtStart = positions.length / 3;
      for (const topIndex of perimeter) {
        addVertex(
          positions[topIndex * 3],
          -skirt,
          positions[topIndex * 3 + 2],
          uvs[topIndex * 2],
          uvs[topIndex * 2 + 1],
        );
      }

      for (let i = 0; i < perimeter.length; i += 1) {
        const next = (i + 1) % perimeter.length;
        const t0 = perimeter[i];
        const t1 = perimeter[next];
        const s0 = skirtStart + i;
        const s1 = skirtStart + next;
        indices.push(t0, s0, t1, t1, s0, s1);
      }
    }

    this.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    this.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    this.setIndex(indices);
    this.computeVertexNormals();
    this.computeBoundingSphere();
  }
}

class TileSegment extends THREE.Mesh<TileGeometry, THREE.ShaderMaterial> {
  readonly worldPosition: THREE.Vector3;
  readonly satelliteTexture: THREE.Texture;
  /** True once the satellite image has loaded or failed; either way it no longer blocks LOD swaps. */
  satelliteSettled = false;

  constructor(
    readonly textureLoader: THREE.TextureLoader,
    readonly zoom: number,
    readonly x: number,
    readonly y: number,
    readonly worldCenterLatlng: LatLng,
    chip: LatLng,
    demMedian: number,
    demMin: number,
    demAvg: number,
    sizeMeters: number,
    demTextureUniform: { value: THREE.Texture },
    demTexSizeUniform: { value: THREE.Vector2 },
    demUvOffset: THREE.Vector2,
    demUvScale: THREE.Vector2,
    useCpuDem: boolean,
    onSatelliteSettled: () => void,
    readonly satelliteAtlas?: SatelliteAtlas,
    readonly bwOSMMaskAtlas?: BwOSMMaskAtlas,
  ) {
    const tileCenter = tileXYToLatLng(x + 0.5, y + 0.5, zoom);
    const offset = latLngToMetersOffset(
      tileCenter.lat,
      tileCenter.lng,
      worldCenterLatlng.lat,
      worldCenterLatlng.lng,
    );

    // Loader callbacks are async, so `segment` is assigned (after super) before they run.
    let segment: TileSegment | undefined;

    const settle = (loaded: boolean) => {
      if (!segment) return;
      material.uniforms.hasSatellite.value = loaded ? 1 : 0;
      segment.satelliteSettled = true;
      onSatelliteSettled();
    };

    const satelliteUrl = `${BASE_URL}/raster/satellite/${zoom}/${x}/${y}.jpeg`;
    const satelliteTexture = textureLoader.load(
      satelliteUrl,
      () => {
        settle(true);
        if (this.zoom === 14 && satelliteAtlas) {
          const source = satelliteTexture.image as CanvasImageSource | undefined;
          if (source) {
            const sample = SatelliteAtlas.sampleImageToTile(source, satelliteAtlas.tilePixelSize);
            satelliteAtlas.updateTile(x, y, sample);
          }
        }
      },
      undefined,
      (error) => {
        console.error(`Failed to load satellite tile ${zoom}/${x}/${y}`, error);
        settle(false);
      },
    );
    satelliteTexture.colorSpace = THREE.NoColorSpace;
    satelliteTexture.minFilter = THREE.LinearFilter;
    satelliteTexture.magFilter = THREE.LinearFilter;

    const atlasUvOffset = new THREE.Vector2(0, 0);
    const atlasUvScale = new THREE.Vector2(0, 0);

    if (bwOSMMaskAtlas) {
      const scale = 2 ** (zoom - bwOSMMaskAtlas.zoom);
      atlasUvScale.set(1 / (bwOSMMaskAtlas.cols * scale), 1 / (bwOSMMaskAtlas.rows * scale));
      atlasUvOffset.set(
        (x / scale - bwOSMMaskAtlas.minTileX) / bwOSMMaskAtlas.cols,
        1.0 - ((y + 1) / scale - bwOSMMaskAtlas.minTileY) / bwOSMMaskAtlas.rows,
      );
    }

    const material = new THREE.ShaderMaterial({
      defines: useCpuDem ? { DEM_FLOAT: '1' } : {},
      uniforms: {
        ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
        ...SolarUniforms,
        ...CloudShadowUniforms,
        satelliteTexture: { value: satelliteTexture },
        hasSatellite: { value: 0 },
        idColor: { value: new THREE.Color(Math.floor(Math.random() * 0xffffff)) },
        demTexture: demTextureUniform,
        demTexSize: demTexSizeUniform,
        demUvOffset: { value: demUvOffset },
        demUvScale: { value: demUvScale },
        demAvg: { value: demAvg },
        demMedian: { value: demMedian },
        tileMeters: { value: sizeMeters },
        bwOSMMaskAtlas: bwOSMMaskAtlas ? bwOSMMaskAtlas.textureUniform : { value: null },
        hasBwOSMMask: { value: bwOSMMaskAtlas ? 1.0 : 0.0 },
        atlasUvOffset: { value: atlasUvOffset },
        atlasUvScale: { value: atlasUvScale },
        osmMaskColor: { value: new THREE.Color(0x38bdf8) },
        osmMaskOpacity: { value: 0.85 },
        saturation: { value: 2.0 },
        contrast: { value: 1 },
        brightness: { value: 1 },
      },
      vertexShader: tileVertexShader,
      fragmentShader: tileFragmentShader,
      fog: true,
      side: THREE.FrontSide,
      transparent: false,
    });

    const geometry = new TileGeometry(sizeMeters);
    geometry.translate(offset.x, 0, offset.z);

    super(geometry, material);

    segment = this;
    this.satelliteTexture = satelliteTexture;
    this.worldPosition = new THREE.Vector3(offset.x, demMedian, offset.z);
  }
}

class TileGridCell extends THREE.Group {
  tileMesh?: TileSegment;

  public targetZoom: number;
  private subCells: TileGridCell[] = [];
  private isDisposed = false;
  private demTextureUniform: { value: THREE.Texture };
  private demTexSizeUniform: { value: THREE.Vector2 };
  private ownsDemTexture = false;
  private demTextureOwner?: TileGridCell;
  private demUvOffset = new THREE.Vector2(0, 0);
  private demUvScale = new THREE.Vector2(1, 1);
  private _demReady = false;

  readonly volume: THREE.Box3;

  /**
   * The center of tile at the world space.
   */
  private worldPosition = new THREE.Vector3();

  constructor(
    readonly textureLoader: THREE.TextureLoader,
    readonly zoom: number,
    readonly x: number,
    readonly y: number,
    readonly worldCenterLatlng: LatLng,
    readonly chip: LatLng,
    readonly demMedian: number,
    readonly demMin: number,
    readonly demAvg: number,
    readonly tileSizeMeters: number,
    readonly onTextureReady: () => void,
    readonly useCpuDem = USE_CPU_DEM,
    readonly clampThreshold = DEM_CLAMP_THRESHOLD_METERS,
    parentCell?: TileGridCell,
    readonly demAtlas?: DemAtlas,
    readonly satelliteAtlas?: SatelliteAtlas,
    readonly bwOSMMaskAtlas?: BwOSMMaskAtlas,
  ) {
    super();

    const tileCenter = tileXYToLatLng(x + 0.5, y + 0.5, zoom);
    const offset = latLngToMetersOffset(
      tileCenter.lat,
      tileCenter.lng,
      worldCenterLatlng.lat,
      worldCenterLatlng.lng,
    );

    this.worldPosition.set(offset.x, 0, offset.z);

    const half = tileSizeMeters / 2;

    this.volume = new THREE.Box3(
      new THREE.Vector3(offset.x - half, 0, offset.z - half),
      new THREE.Vector3(offset.x + half, 0, offset.z + half),
    );

    this.add(new THREE.Box3Helper(this.volume));

    this.targetZoom = zoom;
    const { demTextureUniform, demTexSizeUniform } = this.initDemTexture(parentCell);
    this.demTextureUniform = demTextureUniform;
    this.demTexSizeUniform = demTexSizeUniform;
    this.createTileMesh();
  }

  get gridKey() {
    return `${this.zoom}/${this.x}/${this.y}`;
  }

  private initDemTexture(parentCell?: TileGridCell): {
    demTextureUniform: { value: THREE.Texture };
    demTexSizeUniform: { value: THREE.Vector2 };
  } {
    if (this.zoom > 15) {
      let parent = parentCell;

      while (parent) {
        if (parent.zoom === 15) {
          const scale = 2 ** (this.zoom - parent.zoom);
          const tileOffsetX = this.x - parent.x * scale;
          const tileOffsetY = this.y - parent.y * scale;

          this.demTextureOwner = parent;
          this.demUvOffset.set(tileOffsetX / scale, 1 - (tileOffsetY + 1) / scale);
          this.demUvScale.set(1 / scale, 1 / scale);
          return {
            demTextureUniform: parent.demTextureUniform,
            demTexSizeUniform: parent.demTexSizeUniform,
          };
        }

        parent = parent.parentCell;
      }

      throw new Error(`Missing zoom-15 DEM source for tile ${this.zoom}/${this.x}/${this.y}`);
    }

    const demUrl = `${BASE_URL}/raster/dem/${this.zoom}/${this.x}/${this.y}.png`;
    this.ownsDemTexture = true;

    if (this.useCpuDem) {
      // 1x1 placeholder texture filled with demMin
      const placeholder = createDemDataTexture({ value: this.demMin });
      const demTextureUniform = { value: placeholder };
      const demTexSizeUniform = { value: new THREE.Vector2(1, 1) };

      loadProcessedDem(demUrl, {
        mean: this.demAvg,
        threshold: this.clampThreshold,
      })
        .then((result) => {
          if (this.isDisposed) return;

          if (this.zoom === 14 && this.demAtlas) {
            this.demAtlas.updateTile(this.x, this.y, result);
          }

          const processedTexture = createDemDataTexture(result);
          const oldTexture = demTextureUniform.value;
          demTextureUniform.value = processedTexture;
          demTexSizeUniform.value.set(result.width, result.height);
          oldTexture.dispose();

          this._demReady = true;
          this.onTextureReady();
        })
        .catch((error) => {
          console.error(`Failed to load CPU DEM tile ${this.zoom}/${this.x}/${this.y}`, error);
        });

      return { demTextureUniform, demTexSizeUniform };
    }

    // Fallback: standard TextureLoader
    const texture = this.textureLoader.load(
      demUrl,
      () => {
        if (this.isDisposed) return;
        this._demReady = true;
        this.onTextureReady();
      },
      undefined,
      (error) => console.error(`Failed to load DEM tile ${this.zoom}/${this.x}/${this.y}`, error),
    );

    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return {
      demTextureUniform: { value: texture },
      demTexSizeUniform: { value: new THREE.Vector2(256, 256) },
    };
  }

  private get demReady(): boolean {
    return this.demTextureOwner ? this.demTextureOwner.demReady : this._demReady;
  }

  /** A cell can be displayed once both its DEM and its satellite image have settled. */
  private get ready(): boolean {
    return this.demReady && !!this.tileMesh?.satelliteSettled;
  }

  private get parentCell() {
    return this.parent instanceof TileGridCell ? this.parent : undefined;
  }

  createTileMesh() {
    if (this.tileMesh) return;

    this.tileMesh = new TileSegment(
      this.textureLoader,
      this.zoom,
      this.x,
      this.y,
      this.worldCenterLatlng,
      this.chip,
      this.demMedian,
      this.demMin,
      this.demAvg,
      this.tileSizeMeters,
      this.demTextureUniform,
      this.demTexSizeUniform,
      this.demUvOffset,
      this.demUvScale,
      this.useCpuDem,
      () => {
        if (this.isDisposed) return;
        this.onTextureReady();
      },
      this.satelliteAtlas,
      this.bwOSMMaskAtlas,
    );

    this.add(this.tileMesh);
  }

  private ensureSubCells() {
    if (this.subCells.length > 0 || this.zoom >= MAX_ZOOM) return;

    const childZoom = this.zoom + 1;
    const childTileSizeMeters = this.tileSizeMeters / 2;

    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const child = new TileGridCell(
          this.textureLoader,
          childZoom,
          this.x * 2 + col,
          this.y * 2 + row,
          this.worldCenterLatlng,
          this.chip,
          this.demMedian,
          this.demMin,
          this.demAvg,
          childTileSizeMeters,
          this.onTextureReady,
          this.useCpuDem,
          this.clampThreshold,
          this,
          this.demAtlas,
          this.satelliteAtlas,
          this.bwOSMMaskAtlas,
        );
        this.subCells.push(child);
        this.add(child);
      }
    }
  }

  private disposeSubCells() {
    for (const cell of this.subCells) {
      cell.disposeSubtree();
    }
    this.subCells = [];
  }

  private disposeTileMesh() {
    if (!this.tileMesh) return;

    this.remove(this.tileMesh);
    disposeAnyMesh(this.tileMesh);
    this.tileMesh = undefined;
  }

  disposeSubtree() {
    this.isDisposed = true;

    this.disposeSubCells();
    this.disposeTileMesh();

    if (this.ownsDemTexture) {
      this.demTextureUniform.value.dispose();
      this.ownsDemTexture = false;
    }

    this.parent?.remove(this);
  }

  private getDistanceToCamera(camera: THREE.PerspectiveCamera) {
    const camPos = camera.position;
    return this.volume.distanceToPoint(camPos);
  }

  reconcile(camera: THREE.PerspectiveCamera): boolean {
    const viewDistance = Math.max(this.getDistanceToCamera(camera), 300);
    const targetZoom = Math.max(this.zoom, distToZoomLevel(viewDistance));

    this.targetZoom = targetZoom;

    if (targetZoom <= this.zoom) {
      this.disposeSubCells();
      this.tileMesh.visible = true;
      return this.ready;
    }

    this.ensureSubCells();
    if (this.subCells.length === 0) {
      this.tileMesh.visible = true;
      return this.ready;
    }

    let subCellsReady = true;

    for (const cell of this.subCells) {
      subCellsReady = cell.reconcile(camera) && subCellsReady;
    }

    for (const cell of this.subCells) {
      cell.visible = subCellsReady;
    }

    this.tileMesh.visible = !subCellsReady;
    return subCellsReady || this.ready;
  }
}

export class TileGrid extends THREE.Group<TileEvents> {
  readonly tileSizeMeters: number;
  readonly expand: number;

  readonly loadedWorldSizeMeters: number;

  readonly chip: LatLng;
  readonly box: THREE.Box3;

  readonly bbox: BBox;

  readonly useCpuDem: boolean;
  readonly clampThreshold: number;

  readonly worldCenter: THREE.Vector3;
  readonly worldCenterLatlng: LatLng;

  readonly zoom0: number;
  readonly demAtlas: DemAtlas;
  readonly satelliteAtlas: SatelliteAtlas;
  readonly bwOSMMaskAtlas: BwOSMMaskAtlas;
  private isDisposed = false;

  constructor(
    readonly textureLoader: THREE.TextureLoader,
    {
      chip,
      zoom = 14,
      expand = 2,
      useCpuDem = USE_CPU_DEM,
      clampThreshold = DEM_CLAMP_THRESHOLD_METERS,
    }: TileGridOptions,
  ) {
    super();

    this.chip = chip;
    this.zoom0 = zoom;
    this.useCpuDem = useCpuDem;
    this.clampThreshold = clampThreshold;

    const tileXY = latLngToTileXY(chip.lat, chip.lng, zoom);

    const centerX = Math.floor(tileXY.x);
    const centerY = Math.floor(tileXY.y);

    this.demAtlas = new DemAtlas({
      centerX,
      centerY,
      expand,
      zoom,
      demMedian: 0,
    });
    this.satelliteAtlas = new SatelliteAtlas({
      centerX,
      centerY,
      expand,
      zoom,
      tilePixelSize: 256,
    });
    this.bwOSMMaskAtlas = new BwOSMMaskAtlas({
      centerX,
      centerY,
      centerLat: chip.lat,
      expand,
      zoom,
      tilePixelSize: 256,
    });

    // const debugPlane = new THREE.Mesh(
    //   new THREE.PlaneGeometry(1280, 1280, 1, 1),
    //   new THREE.MeshBasicMaterial({
    //     map: this.satelliteAtlas.texture,
    //     side: THREE.FrontSide,
    //   }),
    // );

    // debugPlane.rotateX(-0.5 * Math.PI);
    // debugPlane.position.y += 1000;

    // this.add(debugPlane);

    // const debugPlane2 = new THREE.Mesh(
    //   new THREE.PlaneGeometry(1280, 1280, 1, 1),
    //   new THREE.MeshBasicMaterial({
    //     map: this.bwOSMMaskAtlas.texture,
    //     side: THREE.FrontSide,
    //   }),
    // );

    // debugPlane2.rotateX(-0.5 * Math.PI);
    // debugPlane2.position.y += 500;

    // this.add(debugPlane2);

    const worldCenterLatlng = tileXYToLatLng(centerX + 0.5, centerY + 0.5, zoom);
    this.worldCenterLatlng = worldCenterLatlng;

    const tileSizeMeters = tileMetersAtLatitude(chip.lat, zoom);

    this.worldCenter = new THREE.Vector3(0, 0, 0);

    this.tileSizeMeters = tileSizeMeters;
    this.expand = expand;

    this.loadedWorldSizeMeters = Math.sqrt(2 * Math.pow(tileSizeMeters * 2 * (expand + 1), 2)) / 2;

    const nw = tileXYToLatLng(centerX - expand, centerY - expand, zoom);
    const se = tileXYToLatLng(centerX + expand + 1, centerY + expand + 1, zoom);

    this.bbox = {
      west: nw.lng,
      north: nw.lat,
      east: se.lng,
      south: se.lat,
    };

    const elevationTileXY = latLngToTileXY(
      worldCenterLatlng.lat,
      worldCenterLatlng.lng,
      THUMB_ELEVATION_ZOOM,
    );

    const elevationTileX = Math.floor(elevationTileXY.x);
    const elevationTileY = Math.floor(elevationTileXY.y);

    const box = new THREE.Box3();
    this.box = box;

    fetchTileAltitude(THUMB_ELEVATION_ZOOM, elevationTileX, elevationTileY)
      .then((altitude) => ({ median: altitude.median, min: altitude.min, avg: altitude.avg }))
      .catch(() => ({ median: 0, min: 0, avg: 0 }))
      .then(({ min: demMin, avg: demAvg, median }) => {
        if (this.isDisposed) return;

        this.demAtlas.setDemMedian(median);

        console.log({ demMin, demAvg, median });

        const xyMax = 2 ** zoom - 1;
        const onTextureReady = () => {
          if (this.latestCamera) this.scheduleLodUpdate(this.latestCamera, 0);
        };

        for (let row = -expand; row <= expand; row += 1) {
          for (let col = -expand; col <= expand; col += 1) {
            const x = centerX + col;
            const y = centerY + row;

            if (x < 0 || x > xyMax || y < 0 || y > xyMax) {
              continue;
            }

            const mesh = new TileGridCell(
              textureLoader,
              zoom,
              x,
              y,
              worldCenterLatlng,
              chip,
              median,
              demMin,
              demAvg,
              tileSizeMeters,
              onTextureReady,
              this.useCpuDem,
              this.clampThreshold,
              undefined,
              this.demAtlas,
              this.satelliteAtlas,
              this.bwOSMMaskAtlas,
            );

            box.union(mesh.volume);
            this.add(mesh);
          }
        }

        this.add(new THREE.Box3Helper(this.box));
        this.onReady?.();
      });
  }

  private timer: ReturnType<typeof setTimeout> | null = null;
  private latestCamera: THREE.PerspectiveCamera | null = null;

  private scheduleLodUpdate(camera: THREE.PerspectiveCamera, delay = 600) {
    if (this.isDisposed) return;

    this.latestCamera = camera;

    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      const currentCamera = this.latestCamera;
      this.timer = null;
      if (!currentCamera) return;

      for (const child of this.children) {
        if (child instanceof TileGridCell) {
          child.reconcile(currentCamera);
        }
      }
    }, delay);
  }

  onEyesMove(camera: THREE.PerspectiveCamera) {
    this.scheduleLodUpdate(camera);
  }

  private markDisposed() {
    this.isDisposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.latestCamera = null;
  }

  dispose() {
    this.markDisposed();
    this.demAtlas.dispose();
    this.satelliteAtlas.dispose();
    this.bwOSMMaskAtlas.dispose();

    for (const child of this.children) {
      if (child instanceof TileGridCell) {
        child.disposeSubtree();
      } else {
        child.traverse((descendant) => {
          if (descendant instanceof THREE.Mesh) disposeAnyMesh(descendant);
        });
      }
    }

    this.parent?.remove(this);
  }

  onReady: () => void;
}

export type LatLng = { lat: number; lng: number };

export type BBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type TileGridOptions = {
  chip: LatLng;
  zoom?: number;
  expand?: number;
  useCpuDem?: boolean;
  clampThreshold?: number;
};

export function disposeGridTile(tile: TileGrid | null) {
  if (!tile) return;

  if (tile instanceof TileGrid) {
    tile.dispose();
  }
}

function disposeAnyMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    if (material instanceof THREE.MeshBasicMaterial && material.map) {
      material.map.dispose();
    }
    if (mesh instanceof TileSegment) {
      mesh.satelliteTexture.dispose();
    } else if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform.value instanceof THREE.Texture) {
          uniform.value.dispose();
        }
      }
    }
    material.dispose();
  });
}

const tileVertexShader = /*glsl */ `
  #include <fog_pars_vertex>

  uniform sampler2D demTexture;
  uniform vec2 demUvOffset;
  uniform vec2 demUvScale;
  uniform float demAvg;
  uniform float demMedian;
  uniform vec2 demTexSize;
  uniform float tileMeters;
  uniform vec2 atlasUvOffset;
  uniform vec2 atlasUvScale;

  varying vec2 vUv;
  varying vec2 vAtlasUv;
  varying float vViewZ;
  varying vec3 vWorldPosition;
  varying vec3 vTerrainNormal;

#ifdef DEM_FLOAT
  float sampleDem(vec2 uvCoord) {
    return texture2D(demTexture, uvCoord).r;
  }
#else
  float decodeElevation(vec3 color) {
    return color.r * 256.0 + color.g + color.b / 256.0 - 32768.0;
  }
  float sampleDem(vec2 uvCoord) {
    vec3 demRgb = texture2D(demTexture, uvCoord).rgb * 255.0;
    return decodeElevation(demRgb);
  }
#endif

  void main() {
    vUv = uv;
    vAtlasUv = uv * atlasUvScale + atlasUvOffset;
    vec2 demUv = uv * demUvScale + demUvOffset;
    
    float elevation = sampleDem(demUv);
    float raise = elevation - demMedian;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    worldPosition.y += raise;

    vWorldPosition = worldPosition.xyz;

    // Calculate terrain surface normal using central finite differences on DEM
    vec2 texelSize = 1.0 / demTexSize;
    float elevL = sampleDem(demUv - vec2(texelSize.x, 0.0));
    float elevR = sampleDem(demUv + vec2(texelSize.x, 0.0));
    float elevB = sampleDem(demUv - vec2(0.0, texelSize.y));
    float elevT = sampleDem(demUv + vec2(0.0, texelSize.y));

    // Horizontal spacing in meters represented by 2 texels of DEM across this tile
    float metersPerTexel = (tileMeters / demTexSize.x) * demUvScale.x;
    float dX = (elevR - elevL) / max(2.0 * metersPerTexel, 0.001);
    float dZ = (elevT - elevB) / max(2.0 * metersPerTexel, 0.001);

    // In Three.js world space, +Y is up, +X is East, -Z is North
    vec3 localNormal = normalize(vec3(-dX, 1.0, dZ));
    vTerrainNormal = normalize((modelMatrix * vec4(localNormal, 0.0)).xyz);

    vec4 mvPosition = viewMatrix * worldPosition;
    vViewZ = -mvPosition.z;

    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const tileFragmentShader = /*glsl */ `
  #include <fog_pars_fragment>

  uniform sampler2D satelliteTexture;
  uniform float hasSatellite;

  uniform sampler2D bwOSMMaskAtlas;
  uniform float hasBwOSMMask;
  uniform vec3 osmMaskColor;
  uniform float osmMaskOpacity;

  uniform vec3 idColor;
  uniform float brightness;
  uniform float saturation;
  uniform float contrast;

  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 sunAmbient;

  // Cloud shadow projection uniforms
  uniform float cloudAltitude;
  uniform float cloudCoverage;
  uniform float cloudUvScale;
  uniform vec2 cloudWind;
  uniform float cloudWorldSize;
  uniform float cloudShadowDarkness;
  uniform float uCloudTime;
  uniform float demMedian;

  varying vec2 vUv;
  varying vec2 vAtlasUv;
  varying float vViewZ;
  varying vec3 vWorldPosition;
  varying vec3 vTerrainNormal;

${__glsl_funcs__}
${noiseGlsl}

  void main() {
    float dist = vViewZ;

    if (hasSatellite < 0.5) {
      // Placeholder while the satellite image is loading or after it failed.
      gl_FragColor = vec4(idColor, 1.0);
      #include <fog_fragment>
      return;
    }

    vec4 color = texture2D(satelliteTexture, vUv);

    vec3 finalColor = applySaturation(color.rgb, saturation);
    finalColor = applyContrast(finalColor, contrast);
    finalColor = applyBrightness(finalColor, brightness);

    // OSM Vector Mask Layer: blend mask color over satellite imagery
    if (hasBwOSMMask > 0.5) {
      if (vAtlasUv.x >= 0.0 && vAtlasUv.x <= 1.0 && vAtlasUv.y >= 0.0 && vAtlasUv.y <= 1.0) {
        float mask = texture2D(bwOSMMaskAtlas, vAtlasUv).r;
        if (mask > 0.02) {
          discard;
        };
      }
    }

    // 1. Atmospheric sun shading (Option B: DEM-derived normal + dual-tone hillshading)
    vec3 normal = normalize(vTerrainNormal);
    vec3 lightDir = normalize(sunDirection);
    float NdotL = dot(normal, lightDir);

    // Smooth transition from shadowed slope to sunlit ridge
    float sunFactor = smoothstep(-0.25, 0.55, NdotL);
    vec3 sunTint = sunColor * 0.7;

    // 2. Analytical Cloud Shadow Projection
    // Trace sunlight ray backwards from terrain upward to the mid-cumulus cloud altitude
    float lightY = max(lightDir.y, 0.06);
    float terrainHeight = vWorldPosition.y + demMedian;
    float rayDistance = max(0.0, (cloudAltitude - terrainHeight) / lightY);
    vec2 shadowWorldPos = vWorldPosition.xz + lightDir.xz * rayDistance;

    // Compute identical animated FBM cloud UV coordinates
    vec2 windOffset1 = cloudWind * uCloudTime * 0.00035;
    vec2 windOffset2 = vec2(-cloudWind.y, cloudWind.x) * uCloudTime * 0.0002;
    vec2 cloudPlaneUv = shadowWorldPos / cloudWorldSize + vec2(0.5);

    vec2 uv1 = cloudPlaneUv * cloudUvScale + windOffset1;
    vec2 uv2 = cloudPlaneUv * (cloudUvScale * 2.0) + windOffset2;

    float n1 = fbm(uv1);
    float n2 = fbm(uv2 + n1 * 0.7);
    float cloudDensity = (n1 * 0.65 + n2 * 0.35) * 0.5 + 0.5;

    // Evaluate cloud shadow mask matching cloud coverage curve
    float threshold = 1.0 - cloudCoverage;
    float cloudShadowMask = smoothstep(threshold - 0.12, threshold + 0.22, cloudDensity);

    // Cloud shadow attenuates direct sunlight
    float sunAttenuation = 1.0 - cloudShadowMask * cloudShadowDarkness;
    float effectiveSun = sunFactor * sunAttenuation;

    vec3 hillshade = mix(sunAmbient, sunTint, effectiveSun);
    finalColor *= hillshade;

    gl_FragColor = vec4(finalColor, 1.0);

    #include <fog_fragment>
  }
`;
