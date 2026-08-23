import { useEffect, useRef, useState } from "react";
import { GUI } from "lil-gui";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { TileCoords } from "@/osm/tiles.js";
import { fitCameraToTileCenter } from "./camera.js";
import { buildTileVectorGroup } from "./render.js";
import { createGroundTileMesh, disposeGroundTile } from "./ground/index.js";

type ThreeJsTileViewerProps = {
  features: GeoJSON.Feature[];
  tile: TileCoords | null;
};

type Viewer = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  groundTile: THREE.Mesh | null;
  currentTile: ReturnType<typeof buildTileVectorGroup> | null;
};

const textureLoaderFactory = () => {
  return new THREE.TextureLoader(new THREE.LoadingManager());
};

export function ThreeJsTileViewer({ features, tile }: ThreeJsTileViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [textureLoader] = useState<THREE.TextureLoader>(textureLoaderFactory);
  const waterMaskGuiRef = useRef<GUI | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ffffff");

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100_000);
    camera.position.set(4_000, 4_800, 4_000);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      stencil: true,
    });
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
    camera.lookAt(controls.target);
    controls.update();

    // const axesHelper = new THREE.AxesHelper(1_000);
    // const gridHelper = new THREE.GridHelper(1_000, 10, "#ef0fea", "#ffffff");
    // scene.add(axesHelper, gridHelper);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, true);

      const currentTile = viewerRef.current?.currentTile;
      if (currentTile) {
        const fit = fitCameraToTileCenter(
          camera,
          currentTile.projection.widthMeters,
          currentTile.projection.heightMeters,
        );
        controls.target.copy(fit.target);
        controls.minDistance = fit.radius * 0.05;
        controls.maxDistance = fit.distance * 5;
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

    viewerRef.current = {
      scene,
      camera,
      controls,
      groundTile: null,
      currentTile: null,
    };

    return () => {
      waterMaskGuiRef.current?.destroy();
      waterMaskGuiRef.current = null;
      if (viewerRef.current?.groundTile) {
        viewerRef.current.scene.remove(viewerRef.current.groundTile);
      }

      disposeGroundTile(viewerRef.current?.groundTile ?? null);

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

    if (viewer.groundTile) {
      viewer.scene.remove(viewer.groundTile);
      disposeGroundTile(viewer.groundTile);
      viewer.groundTile = null;
    }

    if (!tile) {
      return;
    }

    const renderedTile = buildTileVectorGroup(features, tile, textureLoader);
    viewer.currentTile = renderedTile;

    viewer.groundTile = createGroundTileMesh(
      textureLoader,
      tile,
      renderedTile.projection,
      renderedTile.getHighwayBWMask(),
    );
    viewer.scene.add(viewer.groundTile);

    // const trees = createPointsTrees(
    //   textureLoader,
    //   tile,
    //   renderedTile.projection,
    // );

    // viewer.scene.add(trees.points);

    viewer.scene.add(renderedTile.group);

    const fit = fitCameraToTileCenter(
      viewer.camera,
      renderedTile.projection.widthMeters,
      renderedTile.projection.heightMeters,
    );

    viewer.controls.target.copy(fit.target);
    viewer.controls.minDistance = fit.radius * 0.05;
    viewer.controls.maxDistance = fit.distance * 5;
    viewer.controls.update();
  }, [features, tile]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
