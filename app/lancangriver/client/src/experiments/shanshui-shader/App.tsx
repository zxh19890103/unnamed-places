import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ShanshuiMaterial } from "./ShanshuiMaterial.js";
import { BASE_URL } from "../../calc/constants.js";

const DEM_URL = `${BASE_URL}/raster/dem/13/4285/2894.png`;
const DERIVATIVES_URL = `${BASE_URL}/raster/dem/13/4285/2894/derivatives.png`;
const ALTITUDE_URL = `${BASE_URL}/raster/dem/13/4285/2894/altitude`;

type DemAltitudeResponse = {
  ok: true;
  kind: "dem-altitude";
  min: number;
  max: number;
  avg: number;
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const materialRef = useRef<ShanshuiMaterial | null>(null);
  const sunControlsEnabledRef = useRef(false);
  const lightHelperRef = useRef<THREE.DirectionalLightHelper | null>(null);
  const targetHelperRef = useRef<THREE.AxesHelper | null>(null);

  const [sunControlsEnabled, setSunControlsEnabled] = useState(false);
  const [showNormals, setShowNormals] = useState(false);
  const [slopeDarkenStrength, setSlopeDarkenStrength] = useState(0.65);
  const [sunAzimuthDeg, setSunAzimuthDeg] = useState("0.0");
  const [sunElevationDeg, setSunElevationDeg] = useState("0.0");
  const [elevationRangeText, setElevationRangeText] = useState("loading...");

  sunControlsEnabledRef.current = sunControlsEnabled;

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d111a);

    const camera = new THREE.PerspectiveCamera(
      50,
      mountEl.clientWidth / mountEl.clientHeight,
      0.01,
      200,
    );

    camera.position.set(0.7, 0.45, 0.9);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    mountEl.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const geometry = new THREE.PlaneGeometry(1, 1, 255, 255);
    const material = new ShanshuiMaterial({ displacementScale: 0.0002 });
    materialRef.current = material;
    material.setShowNormals(showNormals);
    material.setSlopeDarkenStrength(slopeDarkenStrength);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);

    const sun = {
      azimuth: Number(material.uniforms.uSunAzimuthRad.value),
      elevation: Number(material.uniforms.uSunElevationRad.value),
    };

    const updateSunReadout = () => {
      setSunAzimuthDeg(
        (THREE.MathUtils.radToDeg(sun.azimuth) % 360).toFixed(1),
      );
      setSunElevationDeg(THREE.MathUtils.radToDeg(sun.elevation).toFixed(1));
    };

    const applySunToScene = () => {
      const sunDirection = new THREE.Vector3(
        Math.sin(sun.azimuth) * Math.cos(sun.elevation),
        Math.sin(sun.elevation),
        Math.cos(sun.azimuth) * Math.cos(sun.elevation),
      ).normalize();

      light.position.copy(sunDirection.clone().multiplyScalar(2));
      material.uniforms.uSunAzimuthRad.value = sun.azimuth;
      material.uniforms.uSunElevationRad.value = sun.elevation;
    };

    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.target.position.set(0, 0, 0);
    scene.add(light);
    scene.add(light.target);

    const lightHelper = new THREE.DirectionalLightHelper(light, 0.25, 0xf6d365);
    lightHelper.visible = sunControlsEnabledRef.current;
    scene.add(lightHelper);
    lightHelperRef.current = lightHelper;

    const targetHelper = new THREE.AxesHelper(0.2);
    targetHelper.position.set(0, 0.001, 0);
    targetHelper.visible = sunControlsEnabledRef.current;
    scene.add(targetHelper);
    targetHelperRef.current = targetHelper;

    applySunToScene();
    updateSunReadout();

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    let disposed = false;
    const loader = new THREE.TextureLoader();

    void Promise.all([
      loader.loadAsync(DEM_URL),
      loader.loadAsync(DERIVATIVES_URL),
      fetch(ALTITUDE_URL).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Altitude request failed: ${response.status}`);
        }

        return (await response.json()) as DemAltitudeResponse;
      }),
    ])
      .then(([demTexture, derivativesTexture, altitude]) => {
        if (disposed) {
          demTexture.dispose();
          derivativesTexture.dispose();
          return;
        }

        material.setDemTexture(demTexture);
        material.setDerivativesTexture(derivativesTexture);

        if (Number.isFinite(altitude.min) && Number.isFinite(altitude.max)) {
          material.setElevationRange(altitude.min, altitude.max);
          setElevationRangeText(
            `${altitude.min.toFixed(0)}m to ${altitude.max.toFixed(0)}m`,
          );
        } else {
          setElevationRangeText("derived from DEM");
        }
      })
      .catch((error: unknown) => {
        console.warn("Failed to load shanshui DEM textures", error);
        setElevationRangeText("unavailable");
      });

    const onResize = () => {
      camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!sunControlsEnabledRef.current) {
        return;
      }

      const step = event.shiftKey ? 0.12 : 0.05;
      let changed = false;

      if (event.key === "ArrowLeft") {
        sun.azimuth -= step;
        changed = true;
      } else if (event.key === "ArrowRight") {
        sun.azimuth += step;
        changed = true;
      } else if (event.key === "ArrowUp") {
        sun.elevation += step;
        changed = true;
      } else if (event.key === "ArrowDown") {
        sun.elevation -= step;
        changed = true;
      }

      if (!changed) {
        return;
      }

      event.preventDefault();
      sun.azimuth = THREE.MathUtils.euclideanModulo(sun.azimuth, Math.PI * 2);
      sun.elevation = THREE.MathUtils.clamp(sun.elevation, 0.08, 1.52);
      applySunToScene();
      updateSunReadout();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);

    let frameId = 0;
    const animate = () => {
      controls.update();
      lightHelper.update();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);

      controls.dispose();
      geometry.dispose();

      const demTexture = material.uniforms.uDemTexture.value;
      if (demTexture instanceof THREE.Texture) {
        demTexture.dispose();
      }

      const derivativesTexture = material.uniforms.uDerivativesTexture.value;
      if (derivativesTexture instanceof THREE.Texture) {
        derivativesTexture.dispose();
      }

      material.dispose();
      materialRef.current = null;
      lightHelper.dispose();
      lightHelperRef.current = null;
      targetHelperRef.current = null;
      renderer.dispose();

      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    materialRef.current?.setShowNormals(showNormals);
  }, [showNormals]);

  useEffect(() => {
    materialRef.current?.setSlopeDarkenStrength(slopeDarkenStrength);
  }, [slopeDarkenStrength]);

  useEffect(() => {
    if (lightHelperRef.current) {
      lightHelperRef.current.visible = sunControlsEnabled;
    }

    if (targetHelperRef.current) {
      targetHelperRef.current.visible = sunControlsEnabled;
    }
  }, [sunControlsEnabled]);

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
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "10px 12px",
          borderRadius: 8,
          background: "rgba(13, 17, 26, 0.78)",
          color: "#e5e7eb",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={sunControlsEnabled}
            onChange={(event) => setSunControlsEnabled(event.target.checked)}
          />
          Sun controls
        </label>
        <div style={{ marginTop: 6, opacity: sunControlsEnabled ? 1 : 0.6 }}>
          <div>azimuth: {sunAzimuthDeg}deg</div>
          <div>elevation: {sunElevationDeg}deg</div>
          <div>tile elevation: {elevationRangeText}</div>
          <div style={{ marginTop: 4 }}>
            keys: arrows (hold Shift for faster step)
          </div>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          <input
            type="checkbox"
            checked={showNormals}
            onChange={(event) => setShowNormals(event.target.checked)}
          />
          Visualize surface normals
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          <div style={{ marginBottom: 4 }}>
            Slope darkening: {slopeDarkenStrength.toFixed(2)}
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={slopeDarkenStrength}
            onChange={(event) =>
              setSlopeDarkenStrength(Number(event.target.value))
            }
            style={{ width: "100%" }}
          />
        </label>
      </div>
    </div>
  );
}
