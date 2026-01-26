import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { Sky } from "three/addons/objects/Sky.js";
import * as suncalc from "suncalc";

type AnimationRun = (delta: number, elapsed: number) => void;

export class ThreeSetup {
  readonly textureLoader: THREE.TextureLoader;

  readonly world: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  readonly directionalLight: THREE.DirectionalLight;
  readonly ambientLight: THREE.AmbientLight;

  readonly runs: AnimationRun[] = [];

  updateSun: (lat: number, lng: number) => void;
  demXSegments: number;
  demYSegments: number;

  onBeforeRender: (scene: any, renderer: any, camera: any) => void;
  resolution: THREE.Vector2;

  constructor() {
    const mgr = new THREE.LoadingManager();
    this.textureLoader = new THREE.TextureLoader(mgr);
    this.resolution = new THREE.Vector2();
  }

  animate(run: AnimationRun) {
    this.runs.push(run);
  }
}

export const setupThree = (element: HTMLDivElement) => {
  // 1. Scene Setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000); // Set a dark background color

  // 2. Camera Setup
  // PerspectiveCamera( fov, aspect, near, far )
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    100,
    1e6,
  );

  camera.position.set(0, 600, 1000);

  // 3. Renderer Setup
  const renderer = new THREE.WebGLRenderer({ antialias: true }); // Enable antialiasing for smoother edges
  renderer.setPixelRatio(window.devicePixelRatio);

  renderer.setClearColor(0xffffff);
  renderer.setClearAlpha(1);

  const resize = () => {
    const w = element.clientWidth;
    const h = element.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    threeSetup.resolution.set(element.clientWidth, element.clientHeight);
  };

  const controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.maxDistance = 2e6;
  controls.minDistance = 1e2;
  controls.maxPolarAngle = Math.PI;
  controls.minPolarAngle = 0;
  controls.maxAzimuthAngle = Math.PI;
  controls.minAzimuthAngle = -Math.PI;
  controls.zoomSpeed = 1;
  controls.rotateSpeed = 1;

  const clock = new THREE.Clock();
  let delta: number = -1;
  let elapsed: number = -1;

  const animate = () => {
    requestAnimationFrame(animate);

    delta = clock.getDelta();
    elapsed = clock.getElapsedTime();

    for (const run of threeSetup.runs) {
      run(delta, elapsed);
    }

    controls.update(delta);

    if (threeSetup.onBeforeRender) {
      threeSetup.onBeforeRender(scene, renderer, camera);
    } else {
      renderer.render(scene, camera);
    }
  };

  element.appendChild(renderer.domElement);
  new ResizeObserver(resize).observe(element);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(0.0, 1e6, 0.0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.71);

  scene.add(directionalLight, ambientLight);

  const threeSetup = new ThreeSetup();

  // @ts-ignore
  threeSetup.world = scene;
  // @ts-ignore
  threeSetup.camera = camera;
  // @ts-ignore
  threeSetup.controls = controls;
  // @ts-ignore
  threeSetup.directionalLight = directionalLight;
  // @ts-ignore
  threeSetup.ambientLight = ambientLight;
  // @ts-ignore
  threeSetup.renderer = renderer;

  threeSetup.resolution.set(element.clientWidth, element.clientHeight);

  resize();
  animate();

  createSky({ threeSetup, measure: 10000 });

  scene.add(new THREE.AxesHelper(1e4));

  return threeSetup;
};

type CreateSkyOptions = {
  /**
   * meters
   */
  measure: number;
  threeSetup: ThreeSetup;
};

function createSky({ threeSetup, measure }: CreateSkyOptions) {
  const sky = new Sky();
  sky.scale.setScalar(measure); // Large scale to encompass the scene

  // Set sky uniforms
  const uniforms = sky.material.uniforms;
  uniforms["turbidity"].value = 1;
  uniforms["rayleigh"].value = 1;
  uniforms["mieCoefficient"].value = 0.005;
  uniforms["mieDirectionalG"].value = 0.1;

  // Set sun position
  const sun = new THREE.Vector3();

  let now = Date.now();

  const updateSun = (lat: number, lng: number) => {
    const times = suncalc.getTimes(new Date(now), lat, lng);
    const sunPosition = suncalc.getPosition(times.sunrise, lat, lng);
    const phi = Math.PI / 2 - sunPosition.altitude; // Near horizon for sunset
    const theta = sunPosition.azimuth + Math.PI;
    sun.setFromSphericalCoords(1, phi, theta).normalize();
    uniforms["sunPosition"].value.copy(sun);
    sky.material.needsUpdate = true;
    threeSetup.directionalLight.position.copy(sun).setLength(1e6);
  };

  threeSetup.updateSun = updateSun;
  threeSetup.world.add(sky);
}
