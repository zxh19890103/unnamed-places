import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Sky } from './Sky.js';

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

import { disposeGridTile, LatLng, TileGrid } from './_tile.js';
import { BASE_URL } from '@/calc/constants.js';
import { PhotosManager } from './_photo.js';
import { LoadFlatMap, LoadLatlngSyncMap } from './_map.js';
import { OsmJobsCreate } from './_osm.js';
import { buildHighwaysGroup, disposeHighwaysGroup } from './_highways.js';
import { buildWatersGroup, disposeWatersGroup } from './_waters.js';

const CAMERA_ALTITUDE_DEG = 12 * DEG_TO_RAD;
const CAMERA_DISTANCE = 3800;
const DAYTIME = '15:30';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animationRef = useRef<number>(0);
  const tileGridRef = useRef<TileGrid | null>(null);

  const textureLoaderRef = useRef<THREE.TextureLoader>(null);

  const orbitControls = useRef<OrbitControls>(null);
  const mapControls = useRef<MapControls>(null);

  const controlsRef = useRef<THREE.Controls<{ end: {} }>>(null);

  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const latlngReaderRef = useRef<(mouse: THREE.Vector2) => LatLng>(null);

  const photosManagerRef = useRef<PhotosManager>(null);
  const highwaysDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const highwaysGroupRef = useRef<THREE.Group | null>(null);
  const watersDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const watersGroupRef = useRef<THREE.Group | null>(null);

  const [currentGeoNode, setCurrentGeoNode] = useState<JourneyGeoNode>(null);
  const [currentPhoto, setCurrentPhoto] = useState<PhotoRecord>(null);

  const [result, setResult] = useState<JourneyBuildResult>(null);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    textureLoaderRef.current = new THREE.TextureLoader();

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

    {
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.enablePan = true;
      controls.screenSpacePanning = false;

      controls.update();
      controls.enabled = true;

      orbitControls.current = controls;
    }

    {
      const controls = new MapControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.enablePan = true;
      controls.screenSpacePanning = false;

      controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };

      controls.update();
      controls.enabled = false;

      mapControls.current = controls;
    }

    controlsRef.current = orbitControls.current;

    const tileGrid = new TileGrid(textureLoaderRef.current, {
      chip: { lat: 23.1831, lng: 113.3268 },
    });

    tileGridRef.current = tileGrid;
    scene.add(tileGrid);

    tileGrid.onReady = () => {
      const sky = new Sky({ DAYTIME, r: tileGrid.loadedWorldSizeMeters * 0.6 });
      scene.add(sky);

      tileGrid.box.getCenter(sky.position);
    };

    scene.add(new THREE.AxesHelper(20_000));

    const timer = new THREE.Timer();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      const deltaTime = timer.getDelta();
      photosManagerRef.current?.playAnimation(deltaTime);

      controlsRef.current?.update(deltaTime);

      timer.update();
      renderer.render(scene, camera);
    };

    animate();

    photosManagerRef.current = new PhotosManager(textureLoaderRef.current, scene, camera);

    latlngReaderRef.current = (mouse: THREE.Vector2) => {
      const activeCamera = cameraRef.current;
      const activeTile = tileGridRef.current;
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

    orbitControls.current?.addEventListener('end', () => {
      tileGridRef.current?.onEyesMove(camera);
    });
    mapControls.current?.addEventListener('end', () => {
      tileGridRef.current?.onEyesMove(camera);
    });

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', handleResize);

      controlsRef.current?.dispose();

      disposeGridTile(tileGridRef.current);

      scene.traverse((child) => {
        if (child instanceof Sky) {
          child.parent?.remove(child);
        }
      });

      if (highwaysGroupRef.current && sceneRef.current) {
        sceneRef.current.remove(highwaysGroupRef.current);
        disposeHighwaysGroup(highwaysGroupRef.current);
        highwaysGroupRef.current = null;
      }

      if (watersGroupRef.current && sceneRef.current) {
        sceneRef.current.remove(watersGroupRef.current);
        disposeWatersGroup(watersGroupRef.current);
        watersGroupRef.current = null;
      }

      renderer.dispose();
      mountEl.removeChild(renderer.domElement);
    };
  }, []);

  const handlePhotoSelect = (photo: PhotoRecord, _geoNode: JourneyGeoNode) => {
    setCurrentPhoto(photo);
    photosManagerRef.current.select(photo);
  };

  const handleGeoOpen = async (geoNode: JourneyGeoNode) => {
    if (highwaysGroupRef.current && sceneRef.current) {
      sceneRef.current.remove(highwaysGroupRef.current);
      disposeHighwaysGroup(highwaysGroupRef.current);
      highwaysGroupRef.current = null;
    }

    if (watersGroupRef.current && sceneRef.current) {
      sceneRef.current.remove(watersGroupRef.current);
      disposeWatersGroup(watersGroupRef.current);
      watersGroupRef.current = null;
    }

    const chip: LatLng = { lat: geoNode.representativeLat, lng: geoNode.representativeLng };
    const tilegrid = new TileGrid(textureLoaderRef.current, { chip });
    sceneRef.current.add(tilegrid);
    disposeGridTile(tileGridRef.current);
    tileGridRef.current = tilegrid;

    setCurrentGeoNode(geoNode);

    photosManagerRef.current.openChip(geoNode, tilegrid.worldCenterLatlng);
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

  const switchToOrbitCtrls = () => {
    if (controlsRef.current === orbitControls.current) return;

    controlsRef.current.enabled = false;
    orbitControls.current.enabled = true;

    controlsRef.current = orbitControls.current;
    controlsRef.current.update(0);
  };

  const switchToMapCtrls = () => {
    if (controlsRef.current === mapControls.current) return;

    controlsRef.current.enabled = false;
    mapControls.current.enabled = true;

    controlsRef.current = mapControls.current;
    controlsRef.current.update(0);
  };

  useEffect(() => {
    const tileGrid = tileGridRef.current;
    if (!ready || !tileGrid?.bbox) return;

    const { west, south, east, north } = tileGrid.bbox;
    const highwaysUrl = `${BASE_URL}/vector/highways?bbox=${west},${south},${east},${north}`;
    const watersUrl = `${BASE_URL}/vector/waters?bbox=${west},${south},${east},${north}`;

    let isCancelled = false;

    fetch(highwaysUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Highways query failed with status: ${res.status}`);
        }
        return res.json();
      })
      .then((data: GeoJSON.FeatureCollection) => {
        if (isCancelled || !sceneRef.current) return;
        highwaysDataRef.current = data;

        if (highwaysGroupRef.current) {
          sceneRef.current.remove(highwaysGroupRef.current);
          disposeHighwaysGroup(highwaysGroupRef.current);
          highwaysGroupRef.current = null;
        }

        const highwaysGroup = buildHighwaysGroup(data, tileGrid.worldCenterLatlng);
        highwaysGroupRef.current = highwaysGroup;
        sceneRef.current.add(highwaysGroup);
      })
      .catch((error) => {
        if (isCancelled) return;
        console.error('Failed to fetch highways:', error);
      });

    fetch(watersUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Waters query failed with status: ${res.status}`);
        }
        return res.json();
      })
      .then((data: GeoJSON.FeatureCollection) => {
        if (isCancelled || !sceneRef.current) return;
        watersDataRef.current = data;

        if (watersGroupRef.current) {
          sceneRef.current.remove(watersGroupRef.current);
          disposeWatersGroup(watersGroupRef.current);
          watersGroupRef.current = null;
        }

        const watersGroup = buildWatersGroup(data, tileGrid.worldCenterLatlng);
        watersGroupRef.current = watersGroup;
        sceneRef.current.add(watersGroup);
      })
      .catch((error) => {
        if (isCancelled) return;
        console.error('Failed to fetch waters:', error);
      });

    return () => {
      isCancelled = true;
    };
  }, [ready, currentGeoNode]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-jade-foundation font-suse-mono">
      <div ref={mountRef} className="h-full w-full" aria-label="Photo view in 3D scene" />

      <div className="pointer-events-auto fixed right-4 top-4 z-20">
        <JourneyPanel motions={false} byDay={false} capacities={capacities} />
      </div>

      <div className=" pointer-events-none fixed bottom-4 left-0 flex w-full h-auto justify-center gap-4">
        <button
          type="button"
          onClick={switchToOrbitCtrls}
          className=" cursor-pointer pointer-events-auto text-amber-50"
        >
          Orbit
        </button>
        <button
          type="button"
          onClick={switchToMapCtrls}
          className=" cursor-pointer pointer-events-auto text-amber-50"
        >
          Map
        </button>
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

      <div className=" fixed left-1/2 -translate-x-1/2 top-4">
        {ready && <OsmJobsCreate tileGridRef={tileGridRef} />}
      </div>
    </div>
  );
}
