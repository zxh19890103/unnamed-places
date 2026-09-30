import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  OrbitControls as MapControls,
  OrbitControls,
} from 'three/addons/controls/OrbitControls.js';
import { Sky } from './Sky.js';
import { Panel } from '@/_components/Panel.js';

import { JourneyPanel } from '@/photos/JourneyPanel';
import type {
  JourneyBuildResult,
  JourneyDayNode,
  JourneyGeoNode,
  JourneyPhotosCapacities,
  PhotoRecord,
} from '@/photos/types';
import '@/styles.css';
import { DEG_TO_RAD } from '@/_3dtiles';

import { disposeTile, LatLng, Tile } from './_tile.js';
import { PhotosManager } from './_photo.js';
import { LoadFlatMap, LoadLatlngSyncMap } from './_map.js';

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

const CAMERA_ALTITUDE_DEG = 12 * DEG_TO_RAD;
const CAMERA_DISTANCE = 3800;
const DAYTIME = '15:30';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animationRef = useRef<number>(0);
  const tileRef = useRef<Tile | null>(null);
  const controlsRef = useRef<OrbitControls>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const latlngReaderRef = useRef<(mouse: THREE.Vector2) => LatLng>(null);

  const photosManagerRef = useRef<PhotosManager>(null);

  const [currentGeoNode, setCurrentGeoNode] = useState<JourneyGeoNode>(null);
  const [currentPhoto, setCurrentPhoto] = useState<PhotoRecord>(null);

  const [result, setResult] = useState<JourneyBuildResult>(null);

  const [ready, setReady] = useState(false);

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
    cameraRef.current = camera;

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

    latlngReaderRef.current = (mouse: THREE.Vector2) => {
      const activeCamera = cameraRef.current;
      const activeTile = tileRef.current;
      if (!activeCamera || !activeTile) {
        return { lat: 0, lng: 0 };
      }

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, activeCamera);

      const hit = raycaster.intersectObject(activeTile, true)[0];
      if (!hit) {
        return { lat: 0, lng: 0 };
      }

      const center = activeTile.chip;
      const metersPerDegLat = (Math.PI / 180) * 6371000;
      const metersPerDegLng = metersPerDegLat * Math.cos((center.lat * Math.PI) / 180);

      const lat = center.lat - hit.point.z / metersPerDegLat;
      const lng = center.lng + hit.point.x / metersPerDegLng;

      return { lat, lng };
    };

    const handleResize = () => {
      const width = mountEl.clientWidth;
      const height = mountEl.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    setReady(true);

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
    setCurrentPhoto(photo);
    photosManagerRef.current.select(photo);
  };

  const handleGeoOpen = async (geoNode: JourneyGeoNode) => {
    const chip: LatLng = { lat: geoNode.representativeLat, lng: geoNode.representativeLng };
    const tile = new Tile({ chip });
    sceneRef.current.add(tile);
    disposeTile(tileRef.current);
    tileRef.current = tile;

    setCurrentGeoNode(geoNode);

    photosManagerRef.current.openChip(geoNode);
  };

  const handleGeoOpenByKey = (key: string) => {
    const node = result.geoNodes.find((n) => n.chipKey === key);
    if (node) {
      handleGeoOpen(node);
    }
  };

  const handleGeoClose = () => {
    setCurrentGeoNode(null);
    photosManagerRef.current.closeChip();
  };

  const capacities: JourneyPhotosCapacities = {
    scene: sceneRef.current,
    photo: currentPhoto,
    geoNode: currentGeoNode,
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

      <div className=" fixed bottom-4 left-4">
        {result && <LoadFlatMap data={result} onChipKeySelect={handleGeoOpenByKey} />}
      </div>

      <div className=" fixed left-4 top-4">
        {ready && (
          <LoadLatlngSyncMap
            latlngReader={latlngReaderRef.current}
            controls={controlsRef.current}
          />
        )}
      </div>
    </div>
  );
}
