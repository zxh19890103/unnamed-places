import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { latlngToSphere } from '@/_3dtiles/core.js';
import { JourneyPanel } from '@/photos/JourneyPanel';
import '@/styles.css';
import { JourneyPhotosCapacities } from '@/photos/types';
import { EARTH_RADIUS, START_CENTER_LAT, START_CENTER_LON } from '@/calc/constants';

const longitudeOffsetDegrees = 0;
const latitudeOffsetDegrees = 10;

const PHOTO_POINT_COLOR = new THREE.Color(0xffa500);

function createPhotoPointsFactory({ sizeAttenuation = true }: { sizeAttenuation?: boolean } = {}) {
  const points = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uSize: { value: 24 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;

        uniform float uSize;
        uniform float uPixelRatio;

        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uSize * uPixelRatio;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);

          if (dist > 0.5) {
            discard;
          }

          gl_FragColor = vec4(vColor, 0.7);
        }
      `,
    }),
  );

  points.frustumCulled = false;
  points.visible = false;

  const applyDay = (
    day: { dayKey: string },
    buckets: Map<string, { lat: number; lng: number }[]>,
  ) => {
    const selectedPhotos = buckets.get(day.dayKey) ?? [];
    console.log(selectedPhotos);
    const positions = new Float32Array(selectedPhotos.length * 3);
    const colors = new Float32Array(selectedPhotos.length * 3);

    for (let index = 0; index < selectedPhotos.length; index += 1) {
      const photo = selectedPhotos[index];
      const point = latlngToSphere(photo.lat, photo.lng, 200, EARTH_RADIUS);
      const color = new THREE.Color().setHSL(Math.random(), 0.9, 0.55);

      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    points.geometry.dispose();
    points.geometry = new THREE.BufferGeometry();
    points.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    points.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    points.visible = selectedPhotos.length > 0;
  };

  return { points, applyDay };
}

function createLatLngSphereGeometry(radius: number, longitudeSegments = 96, latitudeSegments = 96) {
  const positions = new Float32Array((longitudeSegments + 1) * (latitudeSegments + 1) * 3);
  const uvs = new Float32Array((longitudeSegments + 1) * (latitudeSegments + 1) * 2);
  const indices: number[] = [];
  const maxMercatorLatitude = 85.05112878;

  for (let latitudeIndex = 0; latitudeIndex <= latitudeSegments; latitudeIndex += 1) {
    const latitude = 90 - (latitudeIndex / latitudeSegments) * 180;
    const mercatorLatitude = THREE.MathUtils.clamp(
      latitude + latitudeOffsetDegrees,
      -maxMercatorLatitude,
      maxMercatorLatitude,
    );
    const latitudeRadians = THREE.MathUtils.degToRad(mercatorLatitude);
    const mercatorV = 0.5 + Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)) / (2 * Math.PI);

    for (let longitudeIndex = 0; longitudeIndex <= longitudeSegments; longitudeIndex += 1) {
      const longitude = -180 + (longitudeIndex / longitudeSegments) * 360;
      const point = latlngToSphere(latitude, longitude, 0, EARTH_RADIUS);
      const vertexIndex = latitudeIndex * (longitudeSegments + 1) + longitudeIndex;

      positions[vertexIndex * 3] = point.x;
      positions[vertexIndex * 3 + 1] = point.y;
      positions[vertexIndex * 3 + 2] = point.z;
      uvs[vertexIndex * 2] =
        THREE.MathUtils.euclideanModulo(longitude + longitudeOffsetDegrees + 180, 360) / 360;
      uvs[vertexIndex * 2 + 1] = mercatorV;
    }
  }

  for (let latitudeIndex = 0; latitudeIndex < latitudeSegments; latitudeIndex += 1) {
    for (let longitudeIndex = 0; longitudeIndex < longitudeSegments; longitudeIndex += 1) {
      const topLeft = latitudeIndex * (longitudeSegments + 1) + longitudeIndex;
      const bottomLeft = topLeft + longitudeSegments + 1;

      indices.push(topLeft, bottomLeft, topLeft + 1, bottomLeft, bottomLeft + 1, topLeft + 1);
    }
  }

  return new THREE.BufferGeometry()
    .setIndex(indices)
    .setAttribute('position', new THREE.BufferAttribute(positions, 3))
    .setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [ready, setReady] = useState(false);
  const [photosCapacities, setPhotosCapacities] = useState<JourneyPhotosCapacities | null>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const { points: photosPoints, applyDay: applySelectedDayPhotoPoints } =
      createPhotoPointsFactory();
    scene.add(photosPoints);

    const camera = new THREE.PerspectiveCamera(
      55,
      mountEl.clientWidth / mountEl.clientHeight,
      0.1,
      EARTH_RADIUS * 4,
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight, true);
    mountEl.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = EARTH_RADIUS * 3;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.8;

    const startEye = latlngToSphere(START_CENTER_LAT, START_CENTER_LON, 500, EARTH_RADIUS);
    const startTarget = latlngToSphere(START_CENTER_LAT, START_CENTER_LON, 0, EARTH_RADIUS);
    camera.position.set(startEye.x, startEye.y, startEye.z);
    controls.target.set(startTarget.x, startTarget.y, startTarget.z);
    controls.update();

    const moveCameraToFirstPhoto = (photos: { lat: number; lng: number }[]) => {
      const targetPhoto = photos[0];
      if (!targetPhoto) {
        return;
      }

      const eye = latlngToSphere(targetPhoto.lat, targetPhoto.lng, 500, EARTH_RADIUS);
      const target = latlngToSphere(targetPhoto.lat, targetPhoto.lng, 0, EARTH_RADIUS);
      camera.position.set(eye.x, eye.y, eye.z);
      controls.target.set(target.x, target.y, target.z);
      controls.update();
    };

    const capacities: JourneyPhotosCapacities = {
      scene,
      onDaySelect: (day, buckets) => {
        applySelectedDayPhotoPoints(day, buckets);
        moveCameraToFirstPhoto(buckets.get(day.dayKey) ?? []);
      },
      onGeoSelect: (geoNode, buckets) => {
        applySelectedDayPhotoPoints({ dayKey: geoNode.chipKey }, buckets);
        moveCameraToFirstPhoto(buckets.get(geoNode.chipKey) ?? []);
      },
    };
    setPhotosCapacities(capacities);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
    directionalLight.position.set(4, 6, 5);
    scene.add(directionalLight);

    const textureLoader = new THREE.TextureLoader();
    const sphereTexture = textureLoader.load('/0zaq_ag24_210203.jpg');
    sphereTexture.colorSpace = THREE.SRGBColorSpace;
    sphereTexture.wrapS = THREE.ClampToEdgeWrapping;
    sphereTexture.wrapT = THREE.ClampToEdgeWrapping;

    const sphere = new THREE.Mesh(
      createLatLngSphereGeometry(EARTH_RADIUS),
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: sphereTexture },
        },
        vertexShader: `
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          varying vec2 vUv;

          void main() {
            gl_FragColor = texture2D(map, vUv);
          }
        `,
      }),
    );
    scene.add(sphere);

    const axes = new THREE.AxesHelper(4);
    axes.position.set(0, 0, 0);
    scene.add(axes);

    const onResize = () => {
      camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountEl.clientWidth, mountEl.clientHeight, true);
    };

    window.addEventListener('resize', onResize);

    let frameId = 0;
    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();
    setReady(true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      cameraRef.current = null;
      controlsRef.current = null;
      mountEl.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-white text-slate-900">
      <div ref={mountRef} className="absolute inset-0" />

      {ready && photosCapacities && (
        <div className="pointer-events-auto fixed right-4 top-4 z-20">
          <JourneyPanel capacities={photosCapacities} />
        </div>
      )}
    </div>
  );
}
