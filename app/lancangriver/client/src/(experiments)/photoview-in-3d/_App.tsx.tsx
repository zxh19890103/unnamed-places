import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls as MapControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from './Sky.js';

import { BASE_URL } from '@/calc/constants.js';
import { JourneyPanel } from '@/photos/JourneyPanel';
import type {
  JourneyBuildResult,
  JourneyDayNode,
  JourneyGeoNode,
  PhotoRecord,
} from '@/photos/types';
import '@/styles.css';
import { DEG_TO_RAD } from '@/_3dtiles';

import {
  latLngToTileUv,
  latLngToTileXY,
  getPhotoUrl,
  fetchTileAltitude,
  latLngToMetersOffset,
} from './_fns';
import { disposeTile, THUMB_ELEVATION_ZOOM, Tile, TILE_ZOOM } from './_tile.js';

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
const DAYTIME = '15:30';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<MapControls | null>(null);
  const planeRef = useRef<THREE.Mesh | null>(null);
  const animationRef = useRef<number>(0);
  const textureRef = useRef<THREE.Texture | null>(null);
  const tileRef = useRef<THREE.Group | null>(null);

  const openGeoNodeRef = useRef<JourneyGeoNode | null>(null);
  const photoMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const selectedPhotoIdRef = useRef<string | null>(null);
  const meshTransitionRef = useRef<{
    startTime: number;
    duration: number;
    mesh: THREE.Object3D;
    startPosition: THREE.Vector3;
    endPosition: THREE.Vector3;
    startQuaternion: THREE.Quaternion;
    endQuaternion: THREE.Quaternion;
    startScale: THREE.Vector3;
    endScale: THREE.Vector3;
    startFov: number;
    endFov: number;
    onComplete?: () => void;
  } | null>(null);

  const expandedPhotoRef = useRef<THREE.Mesh | null>(null);
  const pendingPhotoRef = useRef<{ photo: PhotoRecord; geoNode: JourneyGeoNode } | null>(null);
  const isFocusingRef = useRef(false);
  const demElevationTextureRef = useRef<THREE.Texture | null>(null);
  const demElevationMinRef = useRef<number>(0);
  const demElevationTileRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [photoPath, setPhotoPath] = useState('');
  const [exif, setExif] = useState<ExifData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      53.1,
      mountEl.clientWidth / mountEl.clientHeight,
      1,
      100000,
    );
    const initialAltitude = CAMERA_DISTANCE * Math.sin(CAMERA_ALTITUDE_DEG);
    const initialForward = CAMERA_DISTANCE * Math.cos(CAMERA_ALTITUDE_DEG);
    camera.position.set(0, initialAltitude, initialForward);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.domElement.className = 'block h-full w-full';
    mountEl.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new MapControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.screenSpacePanning = false;

    // controls.mouseButtons = {
    //   LEFT: THREE.MOUSE.PAN,
    //   MIDDLE: THREE.MOUSE.DOLLY,
    //   RIGHT: THREE.MOUSE.ROTATE,
    // };

    controls.update();
    controlsRef.current = controls;

    const tile = new Tile({ chip: { lat: 23.1831, lng: 113.3268 } });
    tileRef.current = tile;
    scene.add(tile);

    scene.add(new THREE.AxesHelper(20_000));

    const sky = new Sky({ DAYTIME, r: tile.loadedWorldSizeMeters });
    scene.add(sky);

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      const transition = meshTransitionRef.current;
      if (transition && cameraRef.current) {
        const elapsed = performance.now() - transition.startTime;
        const t = Math.min(elapsed / transition.duration, 1);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        transition.mesh.position.lerpVectors(
          transition.startPosition,
          transition.endPosition,
          eased,
        );
        transition.mesh.quaternion.slerpQuaternions(
          transition.startQuaternion,
          transition.endQuaternion,
          eased,
        );
        transition.mesh.scale.lerpVectors(transition.startScale, transition.endScale, eased);

        cameraRef.current.fov =
          transition.startFov + (transition.endFov - transition.startFov) * eased;
        cameraRef.current.updateProjectionMatrix();

        if (controlsRef.current) {
          controlsRef.current.update();
        }

        if (t >= 1) {
          const onComplete = meshTransitionRef.current?.onComplete;
          meshTransitionRef.current = null;
          onComplete?.();
        }
      } else {
        controls.update();
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      const width = mountEl.clientWidth;
      const height = mountEl.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      textureRef.current?.dispose();
      planeRef.current?.geometry.dispose();
      (planeRef.current?.material as THREE.Material | undefined)?.dispose();
      disposePhotoMeshes();
      disposeTile(tileRef.current);

      scene.traverse((child) => {
        if (child instanceof Sky) {
          child.parent?.remove(child);
        }
      });

      demElevationTextureRef.current?.dispose();
      demElevationTextureRef.current = null;
      renderer.dispose();
      mountEl.removeChild(renderer.domElement);
    };
  }, []);

  const loadOriginalPhoto = async (filePath: string, targetMesh?: THREE.Mesh) => {
    if (!filePath || !sceneRef.current || !cameraRef.current) return null;

    const encodedPath = encodeURIComponent(filePath);
    const exifResponse = await fetch(`${BASE_URL}/photos/exif/${encodedPath}`);
    if (!exifResponse.ok) {
      const body = (await exifResponse.json().catch(() => ({}))) as {
        error?: { reason?: string };
      };
      throw new Error(body.error?.reason ?? `HTTP ${exifResponse.status} for ${filePath}`);
    }
    const { exif: nextExif } = (await exifResponse.json()) as { exif: ExifData };
    setExif(nextExif);

    const textureLoader = new THREE.TextureLoader();
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      textureLoader.load(
        getPhotoUrl('original', filePath),
        (tex) => resolve(tex),
        undefined,
        (err) => reject(err),
      );
    });
    texture.colorSpace = THREE.SRGBColorSpace;

    const image = texture.image as { width: number; height: number };
    const width = nextExif.imageWidth ?? image.width ?? 1;
    const height = nextExif.imageHeight ?? image.height ?? 1;
    const aspect = width / height;

    const fov = computeVerticalFov(nextExif.focalLengthIn35mmFormat, nextExif.focalLength);

    if (targetMesh) {
      const planeHeight = 260;
      const planeWidth = planeHeight * aspect;
      targetMesh.geometry.dispose();
      targetMesh.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

      const material = targetMesh.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.map = texture;
      material.needsUpdate = true;

      textureRef.current?.dispose();
      textureRef.current = texture;

      return { fov, aspect, exif: nextExif, planeHeight };
    }

    if (planeRef.current) {
      sceneRef.current.remove(planeRef.current);
      planeRef.current.geometry.dispose();
      (planeRef.current.material as THREE.Material).dispose();
      planeRef.current = null;
    }

    const planeHeight = 260;
    const planeWidth = planeHeight * aspect;
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(0, planeHeight / 2, 0);
    plane.rotation.set(PHOTO_TILT, 0, 0);
    sceneRef.current.add(plane);
    planeRef.current = plane;

    textureRef.current?.dispose();
    textureRef.current = texture;

    return { fov, aspect, exif: nextExif, planeHeight };
  };

  const transitionMeshToCamera = (
    object: THREE.Object3D,
    filePath: string,
    fov: number,
    planeHeight: number,
    duration = 700,
  ) => {
    const camera = cameraRef.current;
    if (!camera) return;

    const fovRad = (fov * Math.PI) / 180;
    const distance = planeHeight / 2 / Math.tan(fovRad / 2);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const endPosition = camera.position.clone().add(direction.multiplyScalar(distance));

    const endQuaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(camera.position, endPosition, new THREE.Vector3(0, 1, 0)),
    );

    meshTransitionRef.current = {
      startTime: performance.now(),
      duration,
      mesh: object,
      startPosition: object.position.clone(),
      endPosition,
      startQuaternion: object.quaternion.clone(),
      endQuaternion,
      startScale: object.scale.clone(),
      endScale: new THREE.Vector3(1, 1, 1),
      startFov: camera.fov,
      endFov: fov,
    };
  };

  const focusPhotoMesh = async (photo: PhotoRecord, thumbGroup: THREE.Group) => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    setLoading(true);
    setError(null);
    isFocusingRef.current = true;
    meshTransitionRef.current = null;

    try {
      const focusMaterial = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
      });
      const focusMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), focusMaterial);

      const result = await loadOriginalPhoto(photo.filePath, focusMesh);
      if (!result) {
        focusMaterial.dispose();
        focusMesh.geometry.dispose();
        return;
      }
      const { fov, planeHeight } = result;

      focusMesh.position.copy(thumbGroup.position);
      focusMesh.quaternion.copy(thumbGroup.quaternion);
      focusMesh.scale.copy(thumbGroup.scale);

      focusMesh.userData = {
        thumbGroup,
        originalPosition: thumbGroup.position.clone(),
        originalQuaternion: thumbGroup.quaternion.clone(),
        originalScale: thumbGroup.scale.clone(),
        filePath: photo.filePath,
        photoId: photo.id,
      };

      scene.add(focusMesh);
      expandedPhotoRef.current = focusMesh;
      selectedPhotoIdRef.current = photo.id;

      transitionMeshToCamera(focusMesh, photo.filePath, fov, planeHeight);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      isFocusingRef.current = false;
    }
  };

  const disposeExpandedPhoto = () => {
    const mesh = expandedPhotoRef.current;
    if (!mesh) return;
    mesh.geometry.dispose();
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
    mesh.parent?.remove(mesh);
    expandedPhotoRef.current = null;
    if (textureRef.current) {
      textureRef.current = null;
    }
  };

  const disposePhotoMeshes = () => {
    disposeExpandedPhoto();
    pendingPhotoRef.current = null;
    meshTransitionRef.current = null;
    photoMeshesRef.current.forEach((group) => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const material = child.material as THREE.MeshBasicMaterial;
          material.map?.dispose();
          material.dispose();
        }
      });
      group.parent?.remove(group);
    });
    photoMeshesRef.current.clear();
    selectedPhotoIdRef.current = null;
  };

  const loadElevationTextureForGeoNode = async (geoNode: JourneyGeoNode) => {
    const tileXY = latLngToTileXY(
      geoNode.representativeLat,
      geoNode.representativeLng,
      THUMB_ELEVATION_ZOOM,
    );

    const x = Math.floor(tileXY.x);
    const y = Math.floor(tileXY.y);
    demElevationTileRef.current = { x: tileXY.x, y: tileXY.y };

    const altitude = await fetchTileAltitude(THUMB_ELEVATION_ZOOM, x, y).catch(() => null);
    if (altitude) {
      demElevationMinRef.current = altitude.avg;
    } else {
      demElevationMinRef.current = 0;
    }

    const textureLoader = new THREE.TextureLoader();
    const demUrl = `${BASE_URL}/raster/dem/${THUMB_ELEVATION_ZOOM}/${x}/${y}.png`;
    return new Promise<THREE.Texture | null>((resolve) => {
      textureLoader.load(
        demUrl,
        (texture) => {
          resolve(texture);
        },
        undefined,
        () => resolve(null),
      );
    });
  };

  const openGeoNode = async (geoNode: JourneyGeoNode) => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    disposePhotoMeshes();
    meshTransitionRef.current = null;
    openGeoNodeRef.current = geoNode;

    const lat = geoNode.representativeLat;
    const lng = geoNode.representativeLng;
    const nextTile = new Tile({ chip: { lat, lng }, zoom: TILE_ZOOM });
    disposeTile(tileRef.current);
    tileRef.current = nextTile;
    scene.add(nextTile);

    const altitude = CAMERA_DISTANCE * Math.sin(CAMERA_ALTITUDE_DEG);
    const forward = CAMERA_DISTANCE * Math.cos(CAMERA_ALTITUDE_DEG);
    camera.position.set(0, altitude, forward);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }

    const demTexture = await loadElevationTextureForGeoNode(geoNode);

    if (demTexture) {
      demElevationTextureRef.current?.dispose();
      demElevationTextureRef.current = demTexture;
    }

    const textureLoader = new THREE.TextureLoader();

    geoNode.photos.forEach((photo) => {
      const offset = latLngToMetersOffset(photo.lat, photo.lng, lat, lng);
      const group = new THREE.Group();
      group.position.set(offset.x, 0, offset.z);
      group.rotation.set(PHOTO_TILT, 0, 0);

      const thumbTexture = textureLoader.load(getPhotoUrl('thumb', photo.filePath));
      thumbTexture.minFilter = THREE.LinearFilter;
      thumbTexture.magFilter = THREE.LinearFilter;

      const demTexture = demElevationTextureRef.current;
      const tile = demElevationTileRef.current;
      const demTileUv = latLngToTileUv(photo.lat, photo.lng, THUMB_ELEVATION_ZOOM, tile.x, tile.y);

      const thumbGeometry = new THREE.PlaneGeometry(128, 128);
      thumbGeometry.rotateZ(DEG_TO_RAD * (-45 + Math.random() * 90));

      const thumbMaterial = new THREE.ShaderMaterial({
        uniforms: {
          thumbTexture: { value: thumbTexture },
          demTexture: { value: demTexture },
          demTileUv: { value: new THREE.Vector2(demTileUv.u, demTileUv.v) },
          demMin: { value: demElevationMinRef.current },
          borderColor: { value: new THREE.Color('#ffffff') },
        },
        vertexShader: thumbVertexShader,
        fragmentShader: /*glsl */ `
          uniform sampler2D thumbTexture;
          uniform vec3 borderColor;
          varying vec2 vUv;

          void main() {
            vec4 color = texture2D(thumbTexture, vUv);
            float fill = step(abs(vUv.x - 0.5), 0.44);

            fill += step(abs(vUv.y - 0.5), 0.44);
            fill = 1.0 - step(fill, 1.0);

            vec3 finalColor = mix(borderColor, color.rgb, fill);
            gl_FragColor = vec4(finalColor, 1.0);
          }
        `,
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: false,
      });

      const thumbMesh = new THREE.Mesh(thumbGeometry, thumbMaterial);
      group.add(thumbMesh);

      group.userData = {
        photoId: photo.id,
        filePath: photo.filePath,
      };
      scene.add(group);
      photoMeshesRef.current.set(photo.id, group);
    });
  };

  const closeGeoNode = () => {
    disposePhotoMeshes();
    openGeoNodeRef.current = null;
  };

  useEffect(() => {
    const load = async () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
      if (openGeoNodeRef.current) return;

      setLoading(true);
      setError(null);
      meshTransitionRef.current = null;

      try {
        const result = await loadOriginalPhoto(photoPath);
        if (!result) return;
        const { fov } = result;

        const lat = result.exif.latitude ?? 23.1831;
        const lng = result.exif.longitude ?? 113.3268;
        const nextTile = new Tile({ chip: { lat, lng }, zoom: TILE_ZOOM });
        disposeTile(tileRef.current);
        tileRef.current = nextTile;
        sceneRef.current.add(nextTile);

        const camera = cameraRef.current;
        camera.fov = fov;

        const altitude = CAMERA_DISTANCE * Math.sin(CAMERA_ALTITUDE_DEG);
        const forward = CAMERA_DISTANCE * Math.cos(CAMERA_ALTITUDE_DEG);
        camera.position.set(0, altitude, forward);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        if (controlsRef.current) {
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [photoPath]);

  const transitionMeshToThumb = (object: THREE.Object3D, duration = 700) => {
    const camera = cameraRef.current;
    if (!camera) return;

    meshTransitionRef.current = {
      startTime: performance.now(),
      duration,
      mesh: object,
      startPosition: object.position.clone(),
      endPosition: object.userData.originalPosition.clone(),
      startQuaternion: object.quaternion.clone(),
      endQuaternion: object.userData.originalQuaternion.clone(),
      startScale: object.scale.clone(),
      endScale: object.userData.originalScale.clone(),
      startFov: camera.fov,
      endFov: 45,
      onComplete: () => {
        disposeExpandedPhoto();
        selectedPhotoIdRef.current = null;
        const pending = pendingPhotoRef.current;
        if (pending) {
          pendingPhotoRef.current = null;
          const thumbGroup = photoMeshesRef.current.get(pending.photo.id);
          if (thumbGroup) {
            focusPhotoMesh(pending.photo, thumbGroup);
          }
        }
      },
    };
  };

  const revertExpandedPhoto = () => {
    const mesh = expandedPhotoRef.current;
    if (!mesh) return;
    meshTransitionRef.current = null;
    transitionMeshToThumb(mesh);
  };

  const handlePhotoSelect = (photo: PhotoRecord, geoNode: JourneyGeoNode) => {
    if (isFocusingRef.current) return;

    const currentId = selectedPhotoIdRef.current;
    const expandedMesh = expandedPhotoRef.current;

    if (currentId === photo.id && expandedMesh) {
      pendingPhotoRef.current = null;
      revertExpandedPhoto();
      return;
    }

    if (expandedMesh) {
      pendingPhotoRef.current = { photo, geoNode };
      revertExpandedPhoto();
      return;
    }

    const thumbGroup = photoMeshesRef.current.get(photo.id);
    if (thumbGroup) {
      focusPhotoMesh(photo, thumbGroup);
    } else {
      closeGeoNode();
      setPhotoPath(photo.filePath);
    }

    if (planeRef.current) {
      sceneRef.current?.remove(planeRef.current);
      planeRef.current.geometry.dispose();
      (planeRef.current.material as THREE.Material).dispose();
      planeRef.current = null;
    }
  };

  const handleGeoOpen = async (geoNode: JourneyGeoNode) => {
    await openGeoNode(geoNode);
  };

  const handleGeoClose = () => {
    closeGeoNode();
  };

  const capacities = {
    scene: sceneRef.current ?? new THREE.Scene(),
    onDaySelect: (_day: JourneyDayNode) => {},
    onGeoOpen: handleGeoOpen,
    onGeoClose: handleGeoClose,
    onPhotoSelect: handlePhotoSelect,
    onLoaded: (_journey: JourneyBuildResult) => {},
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-jade-foundation font-suse-mono">
      <div ref={mountRef} className="h-full w-full" aria-label="Photo view in 3D scene" />

      <div className="pointer-events-auto fixed right-4 top-4 z-20">
        <JourneyPanel byDay={false} capacities={capacities} />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
        <div className="pointer-events-auto w-[min(360px,calc(100vw-2rem))] rounded-xl border border-jade-border bg-jade-panel/95 p-4 shadow-sm backdrop-blur-sm">
          <h1 className="mb-3 text-base font-semibold text-jade-text">Photo-in-3D viewer</h1>

          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-jade-text-muted">Photo file</span>
            <span className="text-xs text-jade-text-muted">
              {exif ? exif.fileName : 'None loaded'}
            </span>
          </div>
          <p className="min-h-10 rounded-lg border border-jade-border-soft bg-jade-depth/40 px-3 py-2 text-sm overflow-hidden text-jade-text/80">
            {exif?.filePath ?? 'Select a photo from the timeline panel'}
          </p>

          {error && <p className="mt-3 text-xs text-jade-error">Error: {error}</p>}

          {exif && !error && (
            <div className="mt-4 space-y-2 border-t border-jade-border-soft pt-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-jade-text-muted">Camera</span>
                <span className="text-right text-jade-text">
                  {exif.make} {exif.model}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-jade-text-muted">Lens</span>
                <span className="text-right text-jade-text">{exif.lensModel}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-jade-text-muted">Resolution</span>
                <span className="text-right text-jade-text">
                  {exif.imageWidth} × {exif.imageHeight}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-jade-text-muted">35mm equiv.</span>
                <span className="text-right text-jade-text">
                  {exif.focalLengthIn35mmFormat ?? exif.focalLength} mm
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-jade-text-muted">Vertical FOV</span>
                <span className="text-right text-jade-text">
                  {computeVerticalFov(exif.focalLengthIn35mmFormat, exif.focalLength).toFixed(1)}°
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-jade-text-muted">Exposure</span>
                <span className="text-right text-jade-text">
                  f/{exif.fNumber} ·{' '}
                  {exif.exposureTime ? `${(1 / exif.exposureTime).toFixed(0)}/s` : '-'} · ISO{' '}
                  {exif.iso}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-jade-text-muted">Taken</span>
                <span className="text-right text-jade-text">
                  {exif.dateTimeOriginal ? new Date(exif.dateTimeOriginal).toLocaleString() : '-'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-jade-text-muted">Location</span>
                <span className="text-right text-jade-text">
                  {exif.latitude?.toFixed(4)}°, {exif.longitude?.toFixed(4)}°
                </span>
              </div>
            </div>
          )}
        </div>

        <p className="pointer-events-auto self-end rounded-lg border border-jade-border-soft bg-jade-panel/90 px-3 py-2 text-xs text-jade-text-muted shadow-sm backdrop-blur-sm">
          Left drag to pan · Right drag to rotate · Scroll to zoom
        </p>
      </div>
    </div>
  );
}

const thumbVertexShader = `
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
