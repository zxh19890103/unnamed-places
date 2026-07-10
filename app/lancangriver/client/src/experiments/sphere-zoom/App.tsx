import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  create3dTilesViewer,
  Create3dTilesViewerHandle,
  EARTH_RADIUS,
} from "./3dtiles";

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [setupExposes] = useState<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    threeTiles: Create3dTilesViewerHandle;
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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.minDistance = EARTH_RADIUS + 500;
    controls.maxDistance = EARTH_RADIUS * 2;

    function getAltitude() {
      const distanceToCenter = camera.position.length();
      const altitude = distanceToCenter - EARTH_RADIUS;
      return altitude;
    }

    function adjustControlsZoomSpeed(altitude: number) {
      const zoom = threeTiles.getZoom(altitude);

      controls.zoomSpeed = THREE.MathUtils.clamp(
        1.5 * Math.pow(0.1, zoom),
        0.001,
        1.5,
      );
    }

    function adjustFarNear(altitude: number) {
      // Keep near positive and not too tiny for depth precision.
      const near = THREE.MathUtils.clamp(
        altitude * 0.1,
        10,
        EARTH_RADIUS * 0.1,
      );

      // Make far large enough to cover the Earth sphere and tile layer.
      const far = altitude * 2;

      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(2, 2, 2);
    scene.add(directionalLight);

    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const earthMaterial = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      wireframe: true,
      roughness: 0.8,
      metalness: 0.05,
      visible: false,
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);

    const onResize = () => {
      camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    };

    window.addEventListener("resize", onResize);

    let animationFrameId = 0;
    const animate = () => {
      controls.update();

      const altitude = getAltitude();
      adjustControlsZoomSpeed(altitude);
      adjustFarNear(altitude);

      renderer.render(scene, camera);

      animationFrameId = window.requestAnimationFrame(animate);
    };

    const threeTiles = create3dTilesViewer({ camera, scene });

    let lastDist = camera.position.length();
    controls.addEventListener("end", (e) => {
      const nextDist = camera.position.length();

      if (lastDist - nextDist < 10) {
        // rotate
      } else {
        threeTiles.update();
      }

      lastDist = nextDist;
    });

    animate();

    setupExposes.camera = camera;
    setupExposes.controls = controls;
    setupExposes.threeTiles = threeTiles;

    setIsSetup(true);

    return () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(animationFrameId);
      controls.removeEventListener("end", threeTiles.update);

      threeTiles.dispose();
      controls.dispose();
      earthGeometry.dispose();
      earthMaterial.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
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
    threeTiles: Create3dTilesViewerHandle;
  }) => {
    const [surfaceDistance, setSurfaceDistance] = useState("0");
    const [surfaceDistanceAU, setSurfaceDistanceAU] = useState("0");
    const [centerZoom, setCenterZoom] = useState(null);

    useEffect(() => {
      const onControlsEnd = () => {
        const altitude = camera.position.length() - EARTH_RADIUS;
        const inkms = altitude / 1000;
        const unit = inkms > 1 ? "km" : "m";
        const value = inkms > 1 ? inkms : altitude;

        setSurfaceDistance(value.toFixed(2) + unit);
        setSurfaceDistanceAU((altitude / EARTH_RADIUS).toFixed(2));

        setCenterZoom(threeTiles.getZoom(altitude));
      };

      controls.addEventListener("end", onControlsEnd);

      onControlsEnd();

      return () => {
        controls.removeEventListener("end", onControlsEnd);
      };
    }, []);

    return (
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(15, 23, 42, 0.75)",
          color: "#e2e8f0",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          lineHeight: 1.35,
        }}
      >
        <div>
          camera-to-surface: {surfaceDistance}, {surfaceDistanceAU} au.
        </div>
        <div>center zoom : {centerZoom}</div>
      </div>
    );
  },
);
