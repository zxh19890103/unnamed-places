import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls as MapControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from './Sky.js';
import { Panel } from '@/_components/Panel.js';

import { JourneyPanel } from '@/photos/JourneyPanel';
import type {
  JourneyBuildResult,
  JourneyDayNode,
  JourneyGeoNode,
  PhotoRecord,
} from '@/photos/types';
import '@/styles.css';
import { DEG_TO_RAD } from '@/_3dtiles';

import { disposeTile, LatLng, Tile } from './_tile.js';
import { PhotosManager } from './_photo.js';
import { LoadFlatMap } from './_map.js';

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

const CAMERA_ALTITUDE_DEG = 12 * DEG_TO_RAD;
const CAMERA_DISTANCE = 3800;
const DAYTIME = '15:30';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animationRef = useRef<number>(0);
  const tileRef = useRef<THREE.Group | null>(null);
  const photosManagerRef = useRef<PhotosManager>(null);

  const [exif, setExif] = useState<ExifData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JourneyBuildResult>(null);

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

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.domElement.className = 'block h-full w-full';
    mountEl.appendChild(renderer.domElement);

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

    const tile = new Tile({ chip: { lat: 23.1831, lng: 113.3268 } });
    tileRef.current = tile;
    scene.add(tile);

    scene.add(new THREE.AxesHelper(20_000));

    const sky = new Sky({ DAYTIME, r: tile.loadedWorldSizeMeters * 0.6 });
    scene.add(sky);
    tile.box.getCenter(sky.position);

    const timer = new THREE.Timer();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      const deltaTime = timer.getDelta();
      photosManagerRef.current?.playAnimation(deltaTime);
      controls.update(deltaTime);
      timer.update();
      renderer.render(scene, camera);
    };

    animate();

    photosManagerRef.current = new PhotosManager(scene, camera);

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
      disposeTile(tileRef.current);

      scene.traverse((child) => {
        if (child instanceof Sky) {
          child.parent?.remove(child);
        }
      });

      renderer.dispose();
      mountEl.removeChild(renderer.domElement);
    };
  }, []);

  const handlePhotoSelect = (photo: PhotoRecord, geoNode: JourneyGeoNode) => {
    photosManagerRef.current.select(photo);
  };

  const handleGeoOpen = async (geoNode: JourneyGeoNode) => {
    const chip: LatLng = { lat: geoNode.representativeLat, lng: geoNode.representativeLng };
    const tile = new Tile({ chip });
    sceneRef.current.add(tile);
    disposeTile(tileRef.current);
    tileRef.current = tile;

    photosManagerRef.current.openChip(geoNode);
  };

  const handleGeoOpenByKey = (key: string) => {
    const node = result.geoNodes.find((n) => n.chipKey === key);
    console.log(node);
    if (node) {
      handleGeoOpen(node);
    }
  };

  const handleGeoClose = () => {
    photosManagerRef.current.closeChip();
  };

  const capacities = {
    scene: sceneRef.current,
    onDaySelect: (_day: JourneyDayNode) => {},
    onGeoOpen: handleGeoOpen,
    onGeoClose: handleGeoClose,
    onPhotoSelect: handlePhotoSelect,
    onLoaded: setResult,
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-jade-foundation font-suse-mono">
      <div ref={mountRef} className="h-full w-full" aria-label="Photo view in 3D scene" />

      <div className="pointer-events-auto fixed right-4 top-4 z-20">
        <JourneyPanel byDay={false} capacities={capacities} />
      </div>

      <div className=" fixed bottom-2 left-2">
        {result && <LoadFlatMap data={result} onChipKeySelect={handleGeoOpenByKey} />}
      </div>

      <div className=" fixed left-4 top-4">
        <Panel defaultMinimized className="yes" title="Hello, Photos">
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
              <div className="space-y-2">
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
        </Panel>
      </div>
      <div className=" fixed bottom-0 right-0 pointer-events-none  flex flex-col justify-between p-4">
        <p className="pointer-events-auto self-end rounded-lg border border-jade-border-soft bg-jade-panel/90 px-3 py-2 text-xs text-jade-text-muted shadow-sm backdrop-blur-sm">
          Left drag to pan · Right drag to rotate · Scroll to zoom
        </p>
      </div>
    </div>
  );
}
