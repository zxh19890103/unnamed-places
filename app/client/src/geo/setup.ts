import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const setupThree = (element: HTMLDivElement) => {
  // 1. Scene Setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0da0f0); // Set a dark background color

  // 2. Camera Setup
  // PerspectiveCamera( fov, aspect, near, far )
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    100,
    300000
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
  };

  const controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  const clock = new THREE.Clock();
  let delta: number = -1;

  const animate = () => {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    delta = clock.getDelta();
    controls.update(delta);
  };

  element.appendChild(renderer.domElement);
  new ResizeObserver(resize).observe(element);

  resize();
  animate();

  return {
    world: scene,
    camera,
  };
};
