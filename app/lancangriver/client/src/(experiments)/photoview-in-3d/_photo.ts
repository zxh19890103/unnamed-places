import { JourneyGeoNode, PhotoRecord } from '@/photos/types';
import * as THREE from 'three';
import { THUMB_ELEVATION_ZOOM } from './_tile';
import {
  fetchTileAltitude,
  getPhotoUrl,
  latLngToMetersOffset,
  latLngToTileUv,
  latLngToTileXY,
} from './_fns';
import { DEG_TO_RAD } from '@/_3dtiles';
import { BASE_URL } from '@/calc/constants';
import { __glsl_funcs__ } from './_glsl';

function computeVerticalFov(
  focalLength35mm: number | null,
  focalLength: number | null,
  fallback = 45,
): number {
  const fl = focalLength35mm ?? focalLength;
  if (!fl) return fallback;
  const rad = 2 * Math.atan(12 / fl);
  return (rad * 180) / Math.PI;
}

const PHOTO_TILT = -45 * DEG_TO_RAD;
const CAMERA_ALTITUDE_DEG = 12 * DEG_TO_RAD;
const CAMERA_DISTANCE = 3800;

type PhotoViewMovingState = 'noops' | 'there' | 'coming' | 'going';

type AnimationFuncState = 'alive' | 'killed' | 'dead';
type AnimationFunc = (delta: number, elapsedMs: number, durationMs: number) => AnimationFuncState;

type AnimationCallbacks = {
  onStart: () => void;
  onComplete: () => void;
};

type Animation = {
  id: number;
  func: AnimationFunc;
  state: AnimationFuncState;
  startMs: number;
  elapsedMs: number;
  durationMs: number;
  callbacks: AnimationCallbacks;
};

class PhotoView {
  exifr: ExifData;

  rollRad: number;

  fov: number;
  aspect: number;
  photoHeight: number;

  animationId: number;

  original: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private texture01: THREE.Texture;

  thumbnail: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private texture02: THREE.Texture;

  movingState: PhotoViewMovingState = 'noops';

  get isComing() {
    return this.original && this.movingState === 'coming';
  }

  get isGoing() {
    return this.original && this.movingState === 'going';
  }

  setMovingState(state: PhotoViewMovingState, animationId: number) {
    switch (state) {
      case 'coming': {
        this.movingState = state;
        this.animationId = animationId;
        break;
      }
      case 'going': {
        this.movingState = state;
        this.animationId = animationId;
        break;
      }
      case 'noops': {
        this.movingState = state;
        this.animationId = -1;
        break;
      }
      case 'there': {
        this.movingState = state;
        this.animationId = -1;
        break;
      }
    }
  }

  constructor(
    readonly textureLoader: THREE.TextureLoader,
    readonly camera: THREE.PerspectiveCamera,
    readonly rec: PhotoRecord,
    readonly chip: ChipView,
  ) {
    const rollRad = DEG_TO_RAD * (-45 + Math.random() * 90);
    this.rollRad = rollRad;
  }

  createComingAnimation(): AnimationFunc {
    const { fov, photoHeight, camera } = this;

    const startPosition = new THREE.Vector3();
    const startQuaternion = new THREE.Quaternion();

    this.thumbnail.getWorldPosition(startPosition);
    this.thumbnail.getWorldQuaternion(startQuaternion);

    const startFov = camera.fov;

    const fovRad = (fov * Math.PI) / 180;
    const distance = photoHeight / 2 / Math.tan(fovRad / 2);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const endPosition = camera.position.clone().add(direction.multiplyScalar(distance));

    const endQuaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(camera.position, endPosition, new THREE.Vector3(0, 1, 0)),
    );

    const lerp = (alpha: number) => {
      const _fov = THREE.MathUtils.lerp(startFov, fov, alpha);

      this.original.position.lerpVectors(startPosition, endPosition, alpha);
      this.original.quaternion.slerpQuaternions(startQuaternion, endQuaternion, alpha);

      camera.fov = _fov;
      camera.updateProjectionMatrix();
    };

    return (delta: number, elapsed: number, duration: number) => {
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      lerp(eased);

      if (eased >= 1) {
        return 'dead';
      }

      return 'alive';
    };
  }

  createGoingAnimation(): AnimationFunc {
    const { camera } = this;

    const startPosition = new THREE.Vector3();
    const startQuaternion = new THREE.Quaternion();

    this.original.getWorldPosition(startPosition);
    this.original.getWorldQuaternion(startQuaternion);

    const startFov = camera.fov;
    const fov = 53.1;

    const endPosition = new THREE.Vector3();
    const endQuaternion = new THREE.Quaternion();

    this.thumbnail.getWorldPosition(endPosition);
    this.thumbnail.getWorldQuaternion(endQuaternion);

    const lerp = (alpha: number) => {
      const _fov = THREE.MathUtils.lerp(startFov, fov, alpha);

      this.original.position.lerpVectors(startPosition, endPosition, alpha);
      this.original.quaternion.slerpQuaternions(startQuaternion, endQuaternion, alpha);

      camera.fov = _fov;
      camera.updateProjectionMatrix();
    };

    return (delta: number, elapsed: number, duration: number) => {
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      lerp(eased);

      if (eased >= 1) {
        return 'dead';
      }

      return 'alive';
    };
  }

  buildThumbnail() {
    const photo = this.rec;
    const textureLoader = this.textureLoader;
    const chip = this.chip;

    const thumbTexture = textureLoader.load(getPhotoUrl('thumb', photo.filePath));
    thumbTexture.minFilter = THREE.LinearFilter;
    thumbTexture.magFilter = THREE.LinearFilter;

    this.texture02 = thumbTexture;

    const demTileUv = latLngToTileUv(
      photo.lat,
      photo.lng,
      THUMB_ELEVATION_ZOOM,
      chip.tileX,
      chip.tileY,
    );

    const thumbGeometry = new THREE.PlaneGeometry(128, 128);

    const thumbMaterial = new THREE.ShaderMaterial({
      uniforms: {
        thumbTexture: { value: thumbTexture },
        demTexture: { value: chip.elevationTexture },
        demTileUv: { value: new THREE.Vector2(demTileUv.u, demTileUv.v) },
        demMin: { value: chip.elevation },
        saturation: { value: 2.6 },
        contrast: { value: 1 },
        brightness: { value: 1.2 },
        borderColor: { value: new THREE.Color('#ffffff') },
      },
      vertexShader: thumbVertexShader,
      fragmentShader: thumbFragmentShader,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: false,
    });

    const mesh = new THREE.Mesh(thumbGeometry, thumbMaterial);

    const offset = latLngToMetersOffset(photo.lat, photo.lng, chip.lat, chip.lng);

    mesh.rotation.set(PHOTO_TILT, 0, this.rollRad);
    mesh.position.set(offset.x, 0, offset.z);

    this.thumbnail = mesh;
  }

  async buildOriginal() {
    try {
      if (this.original) {
        console.log(`Original is already created!`);
        return;
      }
      await this._buildOrignal();
    } catch (err_) {
      console.log(err_);
    }
  }

  private async _buildOrignal() {
    const filePath = this.rec.filePath;

    const encodedPath = encodeURIComponent(filePath);
    const exifResponse = await fetch(`${BASE_URL}/photos/exif/${encodedPath}`);

    if (!exifResponse.ok) {
      const body = (await exifResponse.json().catch(() => ({}))) as {
        error?: { reason?: string };
      };
      throw new Error(body.error?.reason ?? `HTTP ${exifResponse.status} for ${filePath}`);
    }

    const { exif } = (await exifResponse.json()) as { exif: ExifData };
    this.exifr = exif;

    const textureLoader = this.textureLoader;
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      textureLoader.load(
        getPhotoUrl('original', filePath),
        (tex) => resolve(tex),
        undefined,
        (err) => reject(err),
      );
    });

    texture.colorSpace = THREE.SRGBColorSpace;
    this.texture01 = texture;

    const image = texture.image as { width: number; height: number };
    const width = exif.imageWidth ?? image.width ?? 1;
    const height = exif.imageHeight ?? image.height ?? 1;
    const aspect = width / height;

    const fov = computeVerticalFov(exif.focalLengthIn35mmFormat, exif.focalLength);

    const meshHeight = 128;
    const meshWidth = meshHeight * aspect;
    const geometry = new THREE.PlaneGeometry(meshWidth, meshHeight);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);

    const photo = this.rec;
    const chip = this.chip;

    const offset = latLngToMetersOffset(photo.lat, photo.lng, chip.lat, chip.lng);

    mesh.position.set(offset.x, meshHeight / 2, offset.z);

    this.original = mesh;
    this.fov = fov;
    this.aspect = aspect;
    this.photoHeight = meshHeight;

    return { fov, aspect, exif, planeHeight: meshHeight };
  }

  dispose() {
    this.disposeOrignal();
    this.disposeThumbnail();
  }

  disposeThumbnail() {
    if (this.thumbnail) {
      this.thumbnail.geometry.dispose();
      this.thumbnail.material.dispose();
    }

    this.texture02?.dispose();
  }

  disposeOrignal() {
    if (this.original) {
      this.original.geometry.dispose();
      this.original.material.dispose();

      this.original = null;
    }

    this.texture01?.dispose();

    this.exifr = null;
    this.aspect = 1;
    this.fov = 45;
    this.photoHeight = 1;

    this.movingState = 'noops';
    this.animationId = -1;
  }
}

class ChipView {
  readonly photos: PhotoView[] = [];

  thumbnails: THREE.Group;

  readonly lat: number;
  readonly lng: number;

  constructor(
    readonly scene: THREE.Scene,
    readonly camera: THREE.PerspectiveCamera,
    readonly textureLoader: THREE.TextureLoader,
    readonly geoNode: JourneyGeoNode,
  ) {
    const tileXY = latLngToTileXY(
      geoNode.representativeLat,
      geoNode.representativeLng,
      THUMB_ELEVATION_ZOOM,
    );

    const x = Math.floor(tileXY.x);
    const y = Math.floor(tileXY.y);

    this.tileX = x;
    this.tileY = y;

    this.lat = geoNode.representativeLat;
    this.lng = geoNode.representativeLng;

    this.ini();
  }

  readonly tileX: number;
  readonly tileY: number;

  elevation: number = 0;
  elevationTexture: THREE.Texture = null;

  private async ini() {
    const { geoNode, camera } = this;

    const altitude = CAMERA_DISTANCE * Math.sin(CAMERA_ALTITUDE_DEG);
    const forward = CAMERA_DISTANCE * Math.cos(CAMERA_ALTITUDE_DEG);
    camera.position.set(0, altitude, forward);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    await this.loadElevationTexture();

    this.thumbnails = new THREE.Group();
    this.scene.add(this.thumbnails);

    for (const photo of geoNode.photos) {
      const pv = new PhotoView(this.textureLoader, this.camera, photo, this);
      pv.buildThumbnail();
      this.thumbnails.add(pv.thumbnail);
      this.photos.push(pv);
    }
  }

  public findPvById(id: string) {
    return this.photos.find((p) => p.rec.id === id) ?? null;
  }

  public getPv(rec: PhotoRecord) {
    return this.photos.find((p) => p.rec === rec) ?? null;
  }

  private async loadElevationTexture() {
    const altitude = await fetchTileAltitude(THUMB_ELEVATION_ZOOM, this.tileX, this.tileY).catch(
      () => null,
    );

    this.elevation = altitude?.avg ?? 0;

    const demUrl = `${BASE_URL}/raster/dem/${THUMB_ELEVATION_ZOOM}/${this.tileX}/${this.tileY}.png`;
    return new Promise<THREE.Texture | null>((resolve) => {
      this.textureLoader.load(
        demUrl,
        (texture) => {
          this.elevationTexture = texture;
          resolve(texture);
        },
        undefined,
        () => resolve(null),
      );
    });
  }

  dispose() {
    this.scene.remove(this.thumbnails);

    for (const pv of this.photos) {
      pv.dispose();
    }

    this.elevationTexture?.dispose();
  }
}

type PhotosManagerEventMap = {
  update: {};
};

export class PhotosManager extends THREE.EventDispatcher<PhotosManagerEventMap> {
  private animations: Animation[] = [];

  selected: PhotoView;

  /**
   * chip is geo node;
   */
  chip: ChipView;
  tile: { x: number; y: number };
  elevation: number;

  readonly textureLoader = new THREE.TextureLoader();

  constructor(
    readonly scene: THREE.Scene,
    readonly camera: THREE.PerspectiveCamera,
  ) {
    super();
  }

  select(rec: PhotoRecord) {
    // remove the last selected
    if (this.selected) {
      if (this.selected.rec === rec) {
        switch (this.selected.movingState) {
          case 'going': {
            this.stopAnimation(this.selected.animationId);
            this.selected.animationId = -1;
            break;
          }
          case 'coming':
            return;
          case 'there': {
            this.movePhotoToThumbnail(this.selected);
            return;
          }
          case 'noops':
            break;
        }
      } else {
        switch (this.selected.movingState) {
          case 'going': {
            break;
          }
          case 'coming': {
            this.movePhotoToThumbnail(this.selected);
            break;
          }
          case 'there': {
            this.movePhotoToThumbnail(this.selected);
            break;
          }
          case 'noops': {
            break;
          }
        }
      }
    }

    const pv = this.chip.getPv(rec);
    if (!pv) return;

    this.selected = pv;
    this.dispatchEvent({ type: 'update' });

    pv.buildOriginal().then(() => {
      if (pv.original) {
        this.scene.add(pv.original);

        if (pv.isComing) return;

        this.movePhotoToCamera(pv);
      } else {
        console.log('no?');
      }
    });
  }

  private destoryPv(pv: PhotoView) {
    if (pv.animationId > -1) {
      this.stopAnimation(pv.animationId);
      pv.animationId = -1;
    }

    if (pv.original) {
      this.scene.remove(pv.original);
      pv.disposeOrignal();
    }
  }

  private destorySelected() {
    if (!this.selected) return;

    this.destoryPv(this.selected);
    this.selected = null;
  }

  playAnimation(delta: number) {
    const animations: Animation[] = [];

    for (const animation of this.animations) {
      if (!animation) continue;
      if (typeof animation.func !== 'function') continue;

      if (animation.state === 'dead') {
        if (animation.callbacks.onComplete) {
          setTimeout(animation.callbacks.onComplete);
        }
        continue;
      }

      if (animation.state === 'killed') {
        continue;
      }

      if (animation.startMs === null) {
        animation.startMs = performance.now();
        if (animation.callbacks.onStart) {
          setTimeout(animation.callbacks.onStart);
        }
      }

      const deltaMs = delta * 1000;
      animation.elapsedMs += deltaMs;

      const state = animation.func(deltaMs, animation.elapsedMs, animation.durationMs);
      animation.state = state;
      animations.push(animation);
    }

    this.animations = animations;
  }

  /**
   * @param func
   * @param duration in sec
   * @returns
   */
  private createAnimation(func: AnimationFunc, duration = 3, options?: AnimationCallbacks) {
    const animtion: Animation = {
      id: this.globalAnimationId++,
      durationMs: duration * 1000,
      func,
      startMs: null,
      elapsedMs: 0,
      state: 'alive',
      callbacks: {
        ...options,
      },
    };

    return animtion;
  }

  private stopAnimation(id: number) {
    if (id === -1) return;
    const animtion = this.animations.find((a) => a.id === id);
    if (!animtion) return;
    animtion.state = 'killed';
  }

  private globalAnimationId = 0;

  private movePhotoToCamera(pv: PhotoView) {
    if (!pv.original) return;

    this.stopAnimation(pv.animationId);

    const animation = this.createAnimation(pv.createComingAnimation(), 3, {
      onStart: () => {
        if (pv.animationId === animation.id) {
          throw new Error(`animation id ${animation.id} already in array.`);
        }

        pv.setMovingState('coming', animation.id);
      },
      onComplete: () => {
        pv.setMovingState('there', animation.id);
      },
    });

    this.animations.push(animation);
  }

  private movePhotoToThumbnail(pv: PhotoView) {
    if (!pv.original) return;

    this.stopAnimation(pv.animationId);

    const animation = this.createAnimation(pv.createGoingAnimation(), 1, {
      onStart: () => {
        if (pv.animationId === animation.id) {
          throw new Error(`animation id ${animation.id} already in array.`);
        }

        pv.setMovingState('going', animation.id);
      },
      onComplete: () => {
        pv.setMovingState('noops', animation.id);
        this.destoryPv(pv);
      },
    });

    this.animations.push(animation);
  }

  private loadChip(geoNode: JourneyGeoNode) {
    this.chip = new ChipView(this.scene, this.camera, this.textureLoader, geoNode);
  }

  private destoryChip() {
    this.chip?.dispose();
    this.chip = null;
  }

  async openChip(geoNode: JourneyGeoNode) {
    if (this.chip?.geoNode === geoNode) {
      return;
    }

    this.destorySelected();
    this.destoryChip();
    this.loadChip(geoNode);

    this.dispatchEvent({ type: 'update' });
  }

  closeChip() {
    this.destorySelected();
    this.destoryChip();
  }
}

const thumbVertexShader = /*glsl */ `
  uniform sampler2D demTexture;
  uniform vec2 demTileUv;
  uniform float demMin;
  varying vec2 vUv;

  float decodeElevation(vec3 color) {
    return color.r * 256.0 + color.g + color.b / 256.0 - 32768.0;
  }

  void main() {
    vUv = uv;
    vec3 demRgb = texture2D(demTexture, demTileUv).rgb * 255.0;
    float elevation = decodeElevation(demRgb);
    float raise = elevation - demMin;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    worldPosition.y += raise;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const thumbFragmentShader = /*glsl */ `
      uniform sampler2D thumbTexture;
      uniform vec3 borderColor;
      uniform float brightness;
      uniform float saturation;
      uniform float contrast;

      varying vec2 vUv;

      ${__glsl_funcs__}

      void main() {
        vec4 color = texture2D(thumbTexture, vUv);
        float fill = step(abs(vUv.x - 0.5), 0.44);

        fill += step(abs(vUv.y - 0.5), 0.44);
        fill = 1.0 - step(fill, 1.0);

        vec3 finalColor = applySaturation( color.rgb,  saturation);
        finalColor = applyContrast( finalColor,  contrast);
        finalColor = applyBrightness( finalColor,  brightness);

        finalColor = mix(borderColor, finalColor.rgb, fill);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

type ExifData = {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  make: string | null;
  model: string | null;
  lensMake: string | null;
  lensModel: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  orientation: string | null;
  focalLength: number | null;
  focalLengthIn35mmFormat: number | null;
  fNumber: number | null;
  exposureTime: number | null;
  iso: number | null;
  exposureProgram: string | null;
  meteringMode: string | null;
  flash: string | null;
  whiteBalance: string | null;
  dateTimeOriginal: string | null;
  createDate: string | null;
  offsetTime: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  gpsImgDirection: number | null;
  gpsImgDirectionRef: string | null;
  software: string | null;
  hasMotionPhoto: boolean;
};
