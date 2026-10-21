import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import { DEG_TO_RAD } from '@/_3dtiles';
import { BASE_URL } from '@/calc/constants.js';
import type { JourneyGeoNode, PhotoRecord } from '@/photos/types';
import { Sky } from './Sky.js';
import { buildHighwaysGroup, disposeHighwaysGroup } from './_highways.js';
import { PhotosManager } from './_photo.js';
import { disposeGridTile, type LatLng, TileGrid } from './_tile.js';
import { buildWatersGroup, disposeWatersGroup, updateWatersAnimation } from './_waters.js';
import {
  buildNaturalWatersGroup,
  disposeNaturalWatersGroup,
  updateNaturalWatersAnimation,
} from './_naturalWaters.js';
import { buildPlacesGroup, disposePlacesGroup, type PlacesGroup } from './_places.js';
import {
  buildNaturalWaterLabelsGroup,
  disposeNaturalWaterLabelsGroup,
  type NaturalWaterLabelsGroup,
} from './_naturalWaterLabels.js';
import {
  buildRoadLabelsGroup,
  disposeRoadLabelsGroup,
  type RoadLabelsGroup,
} from './_roadLabels.js';
import {
  buildWaterwayLabelsGroup,
  disposeWaterwayLabelsGroup,
  type WaterwayLabelsGroup,
} from './_waterwayLabels.js';
import { CloudSystem, CloudShadowUniforms, type CloudSystemOptions } from './_cloud.js';
import { DEFAULT_DAYTIME, setSolarDaytime, SolarUniforms } from './_solar.js';
import {
  DEFAULT_HIGHWAY_WIDTH_SCALE,
  DEFAULT_WATERWAY_WIDTH_SCALE,
  HIGHWAY_WIDTHS_METERS,
  WATERWAY_WIDTHS_METERS,
} from './_bwOSMMaskAtlas.js';

const CAMERA_ALTITUDE_DEG = 12 * DEG_TO_RAD;
const CAMERA_DISTANCE = 3800;
const DEFAULT_INITIAL_CHIP: LatLng = { lat: 23.1831, lng: 113.3268 };

export interface PhotoviewViewerOptions {
  initialChip?: LatLng;
  onTileGridEyesMove?: (camera: THREE.PerspectiveCamera) => void;
  label_roads?: string[];
  labelRoads?: string[];
  label_waterways?: string[];
  labelWaterways?: string[];
}

export class PhotoviewViewer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly textureLoader: THREE.TextureLoader;

  readonly orbitControls: OrbitControls;
  readonly mapControls: MapControls;
  private _currentControls: THREE.Controls<{ end: {} }>;

  private _tileGrid: TileGrid | null = null;

  readonly photosManager: PhotosManager;

  private highwaysGroup: THREE.Group | null = null;
  private watersGroup: THREE.Group | null = null;
  private naturalWatersGroup: THREE.Group | null = null;
  private placesGroup: PlacesGroup | null = null;
  private naturalWaterLabelsGroup: NaturalWaterLabelsGroup | null = null;
  private roadLabelsGroup: RoadLabelsGroup | null = null;
  private waterwayLabelsGroup: WaterwayLabelsGroup | null = null;
  private cloudSystem: CloudSystem | null = null;
  private sky: Sky | null = null;

  private animationId = 0;
  private timer = new THREE.Timer();
  private vectorAbortController: AbortController | null = null;
  private resizeHandler: () => void;
  private isDisposed = false;

  constructor(
    private readonly mountEl: HTMLDivElement,
    private readonly options: PhotoviewViewerOptions = {},
  ) {
    this.textureLoader = new THREE.TextureLoader();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(SolarUniforms.skyHorizon.value, 0.00008);

    const aspect = mountEl.clientWidth / mountEl.clientHeight;
    this.camera = new THREE.PerspectiveCamera(53.1, aspect, 0.1, 100_000);
    const initialAltitude = CAMERA_DISTANCE * Math.sin(CAMERA_ALTITUDE_DEG);
    const initialForward = CAMERA_DISTANCE * Math.cos(CAMERA_ALTITUDE_DEG);
    this.camera.position.set(0, initialAltitude, initialForward);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.domElement.className = 'block h-full w-full';
    mountEl.appendChild(this.renderer.domElement);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.enableDamping = true;
    this.orbitControls.enablePan = true;
    this.orbitControls.screenSpacePanning = false;
    this.orbitControls.update();
    this.orbitControls.enabled = true;

    this.mapControls = new MapControls(this.camera, this.renderer.domElement);
    this.mapControls.target.set(0, 0, 0);
    this.mapControls.enableDamping = true;
    this.mapControls.enablePan = true;
    this.mapControls.screenSpacePanning = false;
    this.mapControls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.mapControls.update();
    this.mapControls.enabled = false;

    this._currentControls = this.orbitControls;

    this.photosManager = new PhotosManager(this.textureLoader, this.scene, this.camera);

    this.scene.add(new THREE.AxesHelper(20_000));

    const initialChip = options.initialChip ?? DEFAULT_INITIAL_CHIP;
    this.setupTileGrid(initialChip);

    const onControlsEnd = () => {
      this._tileGrid?.onEyesMove(this.camera);
      this.options.onTileGridEyesMove?.(this.camera);
    };
    this.orbitControls.addEventListener('end', onControlsEnd);
    this.mapControls.addEventListener('end', onControlsEnd);

    this.resizeHandler = () => {
      const width = this.mountEl.clientWidth;
      const height = this.mountEl.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.placesGroup?.updateViewport(width, height);
      this.naturalWaterLabelsGroup?.updateViewport(width, height);
      this.roadLabelsGroup?.updateViewport(width, height);
      this.waterwayLabelsGroup?.updateViewport(width, height);
    };
    window.addEventListener('resize', this.resizeHandler);

    this.startAnimationLoop();
  }

  get tileGrid(): TileGrid | null {
    return this._tileGrid;
  }

  get currentControls(): THREE.Controls<{ end: {} }> {
    return this._currentControls;
  }

  switchControls(mode: 'orbit' | 'map') {
    const targetControls = mode === 'orbit' ? this.orbitControls : this.mapControls;
    if (this._currentControls === targetControls) return;

    this._currentControls.enabled = false;
    targetControls.enabled = true;

    this._currentControls = targetControls;
    this._currentControls.update(0);
  }

  setDaytime(timeStr: string) {
    setSolarDaytime(timeStr);
    if (this.scene.fog instanceof THREE.FogExp2 || this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(SolarUniforms.skyHorizon.value);
    }
  }

  async openGeoNode(geoNode: JourneyGeoNode): Promise<void> {
    const chip: LatLng = {
      lat: geoNode.representativeLat,
      lng: geoNode.representativeLng,
    };

    const tileGrid = this.setupTileGrid(chip);
    this.photosManager.openChip(geoNode, tileGrid.worldCenterLatlng);
  }

  closeGeoNode() {
    this.photosManager.closeChip();
  }

  selectPhoto(photo: PhotoRecord) {
    this.photosManager.select(photo);
  }

  /**
   * Add a multi-layer atmospheric cloud system (valley mist, mid cumulus, high cirrus) to the scene.
   */
  addClouds(options: CloudSystemOptions = {}): CloudSystem {
    this.removeClouds();

    const worldSize = this._tileGrid?.loadedWorldSizeMeters ?? 25_000;
    CloudShadowUniforms.cloudWorldSize.value = worldSize * 1.8;
    const system = new CloudSystem({
      sizeMeters: worldSize,
      demAtlas: this._tileGrid?.demAtlas,
      worldCenterLatlng: this._tileGrid?.worldCenterLatlng,
      ...options,
    });

    this.cloudSystem = system;
    CloudShadowUniforms.cloudShadowDarkness.value = 0.58;
    this.scene.add(system);
    return system;
  }

  /**
   * Remove and dispose the current cloud system.
   */
  removeClouds(): void {
    if (this.cloudSystem) {
      this.scene.remove(this.cloudSystem);
      this.cloudSystem.dispose();
      this.cloudSystem = null;
      CloudShadowUniforms.cloudShadowDarkness.value = 0.0;
    }
  }

  get clouds(): CloudSystem | null {
    return this.cloudSystem;
  }

  readLatLng = (mouse: THREE.Vector2): LatLng => {
    if (!this.camera || !this._tileGrid) {
      return { lat: 0, lng: 0 };
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const hit = raycaster.intersectObject(this._tileGrid, true)[0];
    if (!hit) {
      return { lat: 0, lng: 0 };
    }

    const center = this._tileGrid.chip;
    const metersPerDegLat = (Math.PI / 180) * 6371000;
    const metersPerDegLng = metersPerDegLat * Math.cos((center.lat * Math.PI) / 180);

    const lat = center.lat - hit.point.z / metersPerDegLat;
    const lng = center.lng + hit.point.x / metersPerDegLng;

    return { lat, lng };
  };

  private setupTileGrid(chip: LatLng): TileGrid {
    this.cleanupVectors();
    this.removeClouds();

    const previousTileGrid = this._tileGrid;
    const tileGrid = new TileGrid(this.textureLoader, { chip });

    this.scene.add(tileGrid);
    if (previousTileGrid) {
      disposeGridTile(previousTileGrid);
    }
    this._tileGrid = tileGrid;

    tileGrid.onReady = () => {
      if (this.isDisposed) return;
      this.removeSky();
      const sky = new Sky({ DAYTIME: DEFAULT_DAYTIME, r: tileGrid.loadedWorldSizeMeters * 0.6 });
      this.sky = sky;
      this.scene.add(sky);
      tileGrid.box.getCenter(sky.position);

      this.addClouds();
    };

    this.fetchVectors(tileGrid);

    return tileGrid;
  }

  private cleanupVectors() {
    if (this.highwaysGroup) {
      this.scene.remove(this.highwaysGroup);
      disposeHighwaysGroup(this.highwaysGroup);
      this.highwaysGroup = null;
    }

    if (this.watersGroup) {
      this.scene.remove(this.watersGroup);
      disposeWatersGroup(this.watersGroup);
      this.watersGroup = null;
    }

    if (this.naturalWatersGroup) {
      this.scene.remove(this.naturalWatersGroup);
      disposeNaturalWatersGroup(this.naturalWatersGroup);
      this.naturalWatersGroup = null;
    }

    if (this.placesGroup) {
      this.scene.remove(this.placesGroup);
      disposePlacesGroup(this.placesGroup);
      this.placesGroup = null;
    }

    if (this.naturalWaterLabelsGroup) {
      this.scene.remove(this.naturalWaterLabelsGroup);
      disposeNaturalWaterLabelsGroup(this.naturalWaterLabelsGroup);
      this.naturalWaterLabelsGroup = null;
    }

    if (this.roadLabelsGroup) {
      this.scene.remove(this.roadLabelsGroup);
      disposeRoadLabelsGroup(this.roadLabelsGroup);
      this.roadLabelsGroup = null;
    }

    if (this.waterwayLabelsGroup) {
      this.scene.remove(this.waterwayLabelsGroup);
      disposeWaterwayLabelsGroup(this.waterwayLabelsGroup);
      this.waterwayLabelsGroup = null;
    }
  }

  private removeSky() {
    if (this.sky) {
      this.scene.remove(this.sky);
      this.sky.dispose();
      this.sky = null;
    }
  }

  private async fetchVectors(tileGrid: TileGrid) {
    if (this.vectorAbortController) {
      this.vectorAbortController.abort();
    }
    const abortController = new AbortController();
    this.vectorAbortController = abortController;
    const { signal } = abortController;

    const { west, south, east, north } = tileGrid.bbox;
    const highwaysUrl = `${BASE_URL}/vector/highways?bbox=${west},${south},${east},${north}`;
    const watersUrl = `${BASE_URL}/vector/waters?bbox=${west},${south},${east},${north}`;
    const naturalWaterUrl = `${BASE_URL}/vector/natural_water?bbox=${west},${south},${east},${north}`;
    const placesUrl = `${BASE_URL}/vector/places?bbox=${west},${south},${east},${north}`;

    try {
      const [highwaysRes, watersRes, naturalWaterRes, placesRes] = await Promise.all([
        fetch(highwaysUrl, { signal }),
        fetch(watersUrl, { signal }),
        fetch(naturalWaterUrl, { signal }),
        fetch(placesUrl, { signal }),
      ]);

      if (signal.aborted || this.isDisposed) return;

      let highwaysData: GeoJSON.FeatureCollection | null = null;
      if (highwaysRes.ok) {
        highwaysData = await highwaysRes.json();
        if (!signal.aborted && !this.isDisposed && this._tileGrid === tileGrid) {
          if (this.highwaysGroup) {
            this.scene.remove(this.highwaysGroup);
            disposeHighwaysGroup(this.highwaysGroup);
          }

          this.highwaysGroup = buildHighwaysGroup(
            highwaysData,
            tileGrid.worldCenterLatlng,
            tileGrid.demAtlas,
            -0.0,
          );

          this.scene.add(this.highwaysGroup);

          if (this.roadLabelsGroup) {
            this.scene.remove(this.roadLabelsGroup);
            disposeRoadLabelsGroup(this.roadLabelsGroup);
          }
          this.roadLabelsGroup = buildRoadLabelsGroup(
            highwaysData,
            tileGrid.worldCenterLatlng,
            tileGrid.demAtlas,
            7.5,
            { value: new THREE.Vector2(this.mountEl.clientWidth, this.mountEl.clientHeight) },
            {
              label_roads: this.options.label_roads ?? this.options.labelRoads,
            },
          );
          this.scene.add(this.roadLabelsGroup);
        }
      }

      let naturalWatersData: GeoJSON.FeatureCollection | null = null;

      if (naturalWaterRes.ok) {
        naturalWatersData = await naturalWaterRes.json();
      }

      let watersData: GeoJSON.FeatureCollection | null = null;
      if (watersRes.ok) {
        watersData = await watersRes.json();

        if (!signal.aborted && !this.isDisposed && this._tileGrid === tileGrid) {
          if (this.watersGroup) {
            this.scene.remove(this.watersGroup);
            disposeWatersGroup(this.watersGroup);
          }

          this.watersGroup = buildWatersGroup(
            watersData,
            tileGrid.worldCenterLatlng,
            tileGrid.demAtlas,
            tileGrid.satelliteAtlas,
            1.0,
            naturalWatersData,
          );

          this.scene.add(this.watersGroup);

          if (this.waterwayLabelsGroup) {
            this.scene.remove(this.waterwayLabelsGroup);
            disposeWaterwayLabelsGroup(this.waterwayLabelsGroup);
          }

          this.waterwayLabelsGroup = buildWaterwayLabelsGroup(
            watersData,
            tileGrid.worldCenterLatlng,
            tileGrid.demAtlas,
            0.8,
            { value: new THREE.Vector2(this.mountEl.clientWidth, this.mountEl.clientHeight) },
            {
              label_waterways: this.options.label_waterways ?? this.options.labelWaterways,
            },
          );
          this.scene.add(this.waterwayLabelsGroup);
        }
      }

      if (naturalWaterRes.ok) {
        if (!signal.aborted && !this.isDisposed && this._tileGrid === tileGrid) {
          if (this.naturalWatersGroup) {
            this.scene.remove(this.naturalWatersGroup);
            disposeNaturalWatersGroup(this.naturalWatersGroup);
          }
          this.naturalWatersGroup = buildNaturalWatersGroup(
            naturalWatersData,
            tileGrid.worldCenterLatlng,
            tileGrid.demAtlas,
            tileGrid.satelliteAtlas,
            30.0,
          );
          this.scene.add(this.naturalWatersGroup);

          if (this.naturalWaterLabelsGroup) {
            this.scene.remove(this.naturalWaterLabelsGroup);
            disposeNaturalWaterLabelsGroup(this.naturalWaterLabelsGroup);
          }
          this.naturalWaterLabelsGroup = buildNaturalWaterLabelsGroup(
            naturalWatersData,
            tileGrid.worldCenterLatlng,
            tileGrid.demAtlas,
            0.5,
            { value: new THREE.Vector2(this.mountEl.clientWidth, this.mountEl.clientHeight) },
          );
          this.scene.add(this.naturalWaterLabelsGroup);
        }
      }

      if (placesRes.ok) {
        const placesData: GeoJSON.FeatureCollection = await placesRes.json();
        if (!signal.aborted && !this.isDisposed && this._tileGrid === tileGrid) {
          if (this.placesGroup) {
            this.scene.remove(this.placesGroup);
            disposePlacesGroup(this.placesGroup);
          }
          this.placesGroup = buildPlacesGroup(
            placesData,
            tileGrid.worldCenterLatlng,
            tileGrid.demAtlas,
            0.5,
            { value: new THREE.Vector2(this.mountEl.clientWidth, this.mountEl.clientHeight) },
          );
          this.scene.add(this.placesGroup);
        }
      }

      if (
        !signal.aborted &&
        !this.isDisposed &&
        this._tileGrid === tileGrid &&
        tileGrid.bwOSMMaskAtlas
      ) {
        tileGrid.bwOSMMaskAtlas.clear();

        if (naturalWatersData) {
          tileGrid.bwOSMMaskAtlas.drawPolygons(naturalWatersData);
        }

        if (watersData) {
          tileGrid.bwOSMMaskAtlas.drawLines(watersData, {
            propertyKey: 'waterway',
            widthTable: WATERWAY_WIDTHS_METERS,
            widthScale: DEFAULT_WATERWAY_WIDTH_SCALE,
          });
        }

        if (highwaysData) {
          tileGrid.bwOSMMaskAtlas.drawLines(highwaysData, {
            propertyKey: 'highway',
            widthTable: HIGHWAY_WIDTHS_METERS,
            widthScale: DEFAULT_HIGHWAY_WIDTH_SCALE,
          });
        }

        tileGrid.bwOSMMaskAtlas.flush(this.renderer);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal.aborted) {
        return;
      }
      console.error('Failed to fetch vectors:', error);
    }
  }

  private startAnimationLoop() {
    const animate = () => {
      if (this.isDisposed) return;
      this.animationId = requestAnimationFrame(animate);

      const deltaTime = this.timer.getDelta();
      this.photosManager.playAnimation(deltaTime);

      updateWatersAnimation(this.watersGroup, deltaTime);
      updateNaturalWatersAnimation(this.naturalWatersGroup, deltaTime);

      if (this.cloudSystem) {
        this.cloudSystem.update(deltaTime);
      }

      this._currentControls?.update(deltaTime);
      this.timer.update();
    };

    const render = () => {
      this.renderer.render(this.scene, this.camera);
    };

    // this.mapControls.addEventListener('change', render);
    this.orbitControls.addEventListener('change', render);
    animate();
  }

  dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.animationId);

    if (this.vectorAbortController) {
      this.vectorAbortController.abort();
    }

    window.removeEventListener('resize', this.resizeHandler);

    this.orbitControls.dispose();
    this.mapControls.dispose();

    if (this._tileGrid) {
      disposeGridTile(this._tileGrid);
      this._tileGrid = null;
    }

    this.removeSky();
    this.removeClouds();
    this.cleanupVectors();

    this.renderer.dispose();
    if (this.mountEl.contains(this.renderer.domElement)) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
