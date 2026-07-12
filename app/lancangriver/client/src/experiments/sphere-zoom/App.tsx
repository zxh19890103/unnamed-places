import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  create3dTilesViewer,
  Create3dTilesViewerHandle,
  EARTH_RADIUS,
} from "./3dtiles";
import { latlngToSphere, sphereToLatlng } from "./tile";

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
        1.5 * (1 / Math.pow(2, zoom)),
        0.000001,
        1.5,
      );

      controls.rotateSpeed = THREE.MathUtils.clamp(
        1 / Math.pow(2, zoom),
        0.000001,
        1,
      );
    }

    function adjustFarNear(altitude: number) {
      // Keep near positive and not too tiny for depth precision.
      const near = THREE.MathUtils.clamp(
        altitude * 0.1,
        10,
        EARTH_RADIUS * 0.1,
      );

      // Horizon distance from camera to tangent point on the sphere.
      const distanceToCenter = EARTH_RADIUS + altitude;
      const horizonDistance = Math.sqrt(
        Math.max(
          0,
          distanceToCenter * distanceToCenter - EARTH_RADIUS * EARTH_RADIUS,
        ),
      );

      // Add margin and guarantee far remains greater than near.
      const far = Math.max(horizonDistance * 1.1, near + 1_000);

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

      if (speedNoUpdate) {
      } else {
        adjustControlsZoomSpeed(altitude);
      }

      adjustFarNear(altitude);

      renderer.render(scene, camera);

      animationFrameId = window.requestAnimationFrame(animate);
    };

    const threeTiles = create3dTilesViewer({ camera, scene });

    controls.addEventListener("end", (e) => {
      threeTiles.update();
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
    <div className="relative h-screen w-screen overflow-hidden">
      <div ref={mountRef} className="h-full w-full" />
      {isSetup && <Panel {...setupExposes} />}
    </div>
  );
}

let speedNoUpdate = false;

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
    const [centerZoom, setCenterZoom] = useState<number | null>(null);
    const [tileCount, setTileCount] = useState(0);
    const [isUpdateEnabled, setIsUpdateEnabled] = useState(true);

    const moveTargetToLatLng = () => {
      const earthSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, 0),
        EARTH_RADIUS,
      );
      const centerRaycaster = new THREE.Raycaster();
      const centerNdc = new THREE.Vector2(0, 0);
      const hitPoint = new THREE.Vector3();

      centerRaycaster.setFromCamera(centerNdc, camera);
      const hasHit =
        centerRaycaster.ray.intersectSphere(earthSphere, hitPoint) !== null;

      if (!hasHit) {
        return;
      }

      const latlng = sphereToLatlng(hitPoint.x, hitPoint.y, hitPoint.z);
      const clampedLat = THREE.MathUtils.clamp(
        latlng.lat,
        -85.05112878,
        85.05112878,
      );
      const wrappedLng = ((((latlng.lng + 180) % 360) + 360) % 360) - 180;
      const point = latlngToSphere(clampedLat, wrappedLng, EARTH_RADIUS);

      controls.target.set(point.x, point.y, point.z);

      const target = new THREE.Vector3(point.x, point.y, point.z);
      const localUp = target.clone().normalize();
      const worldNorth = new THREE.Vector3(0, 1, 0);

      let tangentRight = new THREE.Vector3().crossVectors(worldNorth, localUp);
      if (tangentRight.lengthSq() < 1e-12) {
        tangentRight = new THREE.Vector3(1, 0, 0).cross(localUp);
      }
      tangentRight.normalize();

      const offset = camera.position.clone().sub(target);
      const offsetDistance = Math.max(offset.length(), 1_000);
      let horizontalDir = offset
        .clone()
        .sub(localUp.clone().multiplyScalar(offset.dot(localUp)));

      if (horizontalDir.lengthSq() < 1e-12) {
        horizontalDir = tangentRight;
      } else {
        horizontalDir.normalize();
      }

      const altitudeAngleRad = Math.PI / 4;
      const viewDir = horizontalDir
        .multiplyScalar(Math.cos(altitudeAngleRad))
        .add(localUp.clone().multiplyScalar(Math.sin(altitudeAngleRad)))
        .normalize();

      camera.position.copy(target).add(viewDir.multiplyScalar(offsetDistance));

      camera.up.copy(localUp);

      controls.minDistance = 500;
      controls.maxDistance = EARTH_RADIUS;

      camera.lookAt(controls.target);
      controls.update();
      threeTiles.update();

      controls.rotateSpeed = 1;
      controls.zoomSpeed = 1;

      speedNoUpdate = true;
    };

    const moveTargetToEarthCenter = () => {
      const worldCenter = new THREE.Vector3(0, 0, 0);

      controls.target.copy(worldCenter);

      const minRadius = EARTH_RADIUS + 500;
      const cameraDir = camera.position.clone().normalize();
      const nextRadius = Math.max(camera.position.length(), minRadius);
      camera.position.copy(cameraDir.multiplyScalar(nextRadius));

      camera.up.set(0, 1, 0);

      controls.minDistance = minRadius;
      controls.maxDistance = EARTH_RADIUS * 2;

      camera.lookAt(worldCenter);
      controls.update();
      threeTiles.update();

      speedNoUpdate = false;
    };

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
            onClick={moveTargetToLatLng}
            className="rounded-md bg-slate-800 px-2 py-1 text-slate-100 transition-colors hover:bg-slate-700"
          >
            look at (latlng)
          </button>
        </div>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={moveTargetToEarthCenter}
            className="rounded-md bg-slate-800 px-2 py-1 text-slate-100 transition-colors hover:bg-slate-700"
          >
            look at (0,0,0)
          </button>
        </div>
      </div>
    );
  },
);
