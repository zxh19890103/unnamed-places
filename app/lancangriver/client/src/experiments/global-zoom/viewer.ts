import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { create3DTilesViewer } from "./3d-tiles.js";

export type ViewMetrics = {
  layerSize: string;
  cameraDistance: string;
  sizePixelsPerUnit: string;
  viewport: string;
  zoomScale: string;
  zoomLevel: string;
};

type CreateGlobalZoomViewParams = {
  mountEl: HTMLDivElement;
  onMetrics: (metrics: ViewMetrics) => void;
};

export type GlobalZoomViewHandle = {
  dispose: () => void;
};

export function createGlobalZoomView(
  params: CreateGlobalZoomViewParams,
): GlobalZoomViewHandle {
  const { mountEl, onMetrics } = params;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    60,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    1000,
  );

  camera.position.set(0, 0, 300);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  mountEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enableRotate = true;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(8, 10, 6);
  scene.add(directionalLight);

  const axesHelper = new THREE.AxesHelper(4);
  scene.add(axesHelper);

  const gridHelper = new THREE.GridHelper(8, 8, 0x93c5fd, 0x334155);
  scene.add(gridHelper);

  const onResize = (): void => {
    camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);

    ThreeDTilesViewer.onEyesMove(camera.position);
  };

  window.addEventListener("resize", onResize);

  const ThreeDTilesViewer = create3DTilesViewer({
    camera,
    scene,
  });

  let animationFrameId = 0;
  const animate = (): void => {
    controls.update();

    const viewportSize = new THREE.Vector2();
    renderer.getSize(viewportSize);

    const projectToViewport = (point: THREE.Vector3): THREE.Vector2 => {
      const projected = point.clone().project(camera);
      return new THREE.Vector2(
        ((projected.x + 1) * viewportSize.x) / 2,
        ((1 - projected.y) * viewportSize.y) / 2,
      );
    };

    const p0 = projectToViewport(new THREE.Vector3(-4, -4, 0));
    const p1 = projectToViewport(new THREE.Vector3(4, -4, 0));

    const distance = camera.position.length();
    const sideX = p0.distanceTo(p1);

    onMetrics({
      cameraDistance: distance.toFixed(2),
      sizePixelsPerUnit: (sideX / 8).toFixed(2),
      viewport: `${Math.round(viewportSize.x)} x ${Math.round(viewportSize.y)}`,
      zoomScale: ThreeDTilesViewer.getZoomScale(distance).toFixed(2),
      zoomLevel: String(ThreeDTilesViewer.getZoomLevel(distance)),
      layerSize: `${ThreeDTilesViewer.getLayerSize()} tiles`,
    });

    renderer.render(scene, camera);
    animationFrameId = window.requestAnimationFrame(animate);
  };

  animate();

  const onControlsEnd = () => {
    ThreeDTilesViewer.onEyesMove(camera.position.clone());
  };

  controls.addEventListener("end", onControlsEnd);

  return {
    dispose: () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(animationFrameId);

      controls.removeEventListener("end", onControlsEnd);
      ThreeDTilesViewer.onDispose();

      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    },
  };
}
