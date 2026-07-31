import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { TileCoords } from "../../osm/tiles";
import { fitCameraToObject } from "./camera";
import { buildTileVectorGroup } from "./render";

type ThreeJsTileViewerProps = {
  features: GeoJSON.Feature[];
  tile: TileCoords | null;
};

type Viewer = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  currentTile: ReturnType<typeof buildTileVectorGroup> | null;
};

export function ThreeJsTileViewer({ features, tile }: ThreeJsTileViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#09110f");

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100_000);
    camera.position.set(4_000, 4_800, 4_000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#dff5ec", "#14221d", 2.2));
    const sun = new THREE.DirectionalLight("#fff2d0", 3.2);
    sun.position.set(4_000, 7_000, 3_000);
    scene.add(sun);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);

      const currentTile = viewerRef.current?.currentTile;
      if (currentTile) {
        const fit = fitCameraToObject(camera, currentTile.group);
        controls.target.copy(fit.target);
        controls.update();
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let animationFrame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    viewerRef.current = { scene, camera, controls, currentTile: null };

    return () => {
      viewerRef.current?.currentTile?.dispose();
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    if (viewer.currentTile) {
      viewer.scene.remove(viewer.currentTile.group);
      viewer.currentTile.dispose();
      viewer.currentTile = null;
    }

    if (!tile) {
      return;
    }

    const renderedTile = buildTileVectorGroup(features, tile);
    viewer.currentTile = renderedTile;
    viewer.scene.add(renderedTile.group);

    const fit = fitCameraToObject(viewer.camera, renderedTile.group);
    viewer.controls.target.copy(fit.target);
    viewer.controls.minDistance = fit.radius * 0.05;
    viewer.controls.maxDistance = fit.distance * 5;
    viewer.controls.update();
  }, [features, tile]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
