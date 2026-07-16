import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { create3dTilesViewer, Create3dTilesViewer } from "./viewer";
import { EARTH_RADIUS } from "./core";
import { TileMesh } from "./ui";

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [setupExposes] = useState<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    threeTiles: Create3dTilesViewer;
  }>({
    camera: null,
    controls: null,
    threeTiles: null,
  });

  const [isSetup, setIsSetup] = useState(false);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);

    const camera = new THREE.PerspectiveCamera(
      60,
      mountEl.clientWidth / mountEl.clientHeight,
      EARTH_RADIUS * 0.1,
      EARTH_RADIUS * 2,
    );

    camera.position.set(0, 0, EARTH_RADIUS + 1_200_000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    mountEl.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(2, 2, 2);
    scene.add(directionalLight);

    const onResize = () => {
      camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    };

    window.addEventListener("resize", onResize);

    const controls = new OrbitControls(camera, renderer.domElement);

    const threeTiles = create3dTilesViewer({
      camera,
      onDispose: () => {
        //
      },
      onTileRender: (tile) => {
        if (!tile.mesh) {
          new TileMesh(tile, 16);
        }

        scene.add(tile.mesh);
      },
      onTileDestory: (tile) => {
        if (tile.mesh) {
          (tile.mesh as TileMesh).dispose();
          scene.remove(tile.mesh);
        }
      },
    });

    threeTiles.useOrbitControls(controls);

    let animationFrameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);

      animationFrameId = window.requestAnimationFrame(animate);
    };

    animate();

    setupExposes.camera = camera;
    setupExposes.controls = controls;
    setupExposes.threeTiles = threeTiles;

    setIsSetup(true);

    return () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(animationFrameId);

      threeTiles.dispose();
      controls.dispose();

      renderer.dispose();

      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div ref={mountRef} className="h-full w-full" />
      {isSetup && <Panel {...setupExposes} />}
    </div>
  );
}

const Panel = memo(
  ({
    controls,
    camera,
    threeTiles,
  }: {
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    threeTiles: Create3dTilesViewer;
  }) => {
    const [surfaceDistance, setSurfaceDistance] = useState("0");
    const [surfaceDistanceAU, setSurfaceDistanceAU] = useState("0");
    const [centerZoom, setCenterZoom] = useState<number | null>(null);
    const [tileCount, setTileCount] = useState(0);
    const [isUpdateEnabled, setIsUpdateEnabled] = useState(true);

    useEffect(() => {
      const onControlsEnd = () => {
        const altitude = camera.position.length() - EARTH_RADIUS;
        const inkms = altitude / 1000;
        const unit = inkms > 1 ? "km" : "m";
        const value = inkms > 1 ? inkms : altitude;

        setSurfaceDistance(value.toFixed(2) + unit);
        setSurfaceDistanceAU((altitude / EARTH_RADIUS).toFixed(2));

        setCenterZoom(threeTiles.getZoom(altitude));
        setTileCount(threeTiles.getTileCount());
      };

      controls.addEventListener("end", onControlsEnd);

      onControlsEnd();

      return () => {
        controls.removeEventListener("end", onControlsEnd);
      };
    }, []);

    useEffect(() => {
      threeTiles.enableUpdate(isUpdateEnabled);
    }, [isUpdateEnabled, threeTiles]);

    return (
      <div className="absolute left-3 top-3 rounded-lg bg-slate-900/75 px-2.5 py-2 font-mono text-[13px] leading-[1.35] text-slate-200">
        <div>
          camera-to-surface: {surfaceDistance}, {surfaceDistanceAU} au.
        </div>
        <div>center zoom : {centerZoom}</div>
        <div>tiles count : {tileCount}</div>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isUpdateEnabled}
            onChange={(e) => setIsUpdateEnabled(e.target.checked)}
          />
          enable update
        </label>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={threeTiles.lookAtLatlng}
            className="rounded-md bg-slate-800 px-2 py-1 text-slate-100 transition-colors hover:bg-slate-700"
          >
            look at (latlng)
          </button>
        </div>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={threeTiles.lookAtOrigin}
            className="rounded-md bg-slate-800 px-2 py-1 text-slate-100 transition-colors hover:bg-slate-700"
          >
            look at (0,0,0)
          </button>
        </div>
      </div>
    );
  },
);
