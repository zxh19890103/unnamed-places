import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ExploreControls,
  ExploreControlsLiveState,
} from '@/explore/controls/ExploreControls.class';
import { OrbitFactorCharts } from './FactorStudyCharts.js';

import '@/styles.css';
import { EARTH_RADIUS } from '@/calc/constants';
import { Panel } from '@/_components';
import { latlngToSphere } from '@/_3dtiles/core.js';
import { getLocalBasisAtPoint } from '@/calc/sphere.js';
import clsx from 'clsx';

const EARTH_RADIUS_METERS = EARTH_RADIUS;

export default function App() {
  const [ready, setReady] = useState(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<ExploreControls | null>(null);
  const sceneRef = useRef<THREE.Scene>(null);
  const rendererDomRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020817);

    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      mountEl.clientWidth / mountEl.clientHeight,
      1,
      EARTH_RADIUS_METERS * 100,
    );

    camera.position.set(
      EARTH_RADIUS_METERS * 1.5,
      EARTH_RADIUS_METERS * 4.2,
      EARTH_RADIUS_METERS * 1.8,
    );

    camera.position.setLength(EARTH_RADIUS_METERS * 8.5);

    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight, true);
    mountEl.appendChild(renderer.domElement);
    rendererDomRef.current = renderer.domElement;

    const elevation = {
      min: 0,
      max: 0,
    };

    const controls = new ExploreControls(camera, renderer.domElement, {});
    controlsRef.current = controls;

    const setElevationMethod = controls.setElevation;

    const elevationGhostMaterial = new THREE.MeshBasicMaterial({
      wireframe: true,
      depthTest: true,
      color: 0xffffff,
      transparent: true,
      opacity: 0.67,
    });

    const textureLoader = new THREE.TextureLoader();

    const elevationGhost = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_METERS),
      elevationGhostMaterial,
    );

    scene.add(elevationGhost);

    let elevationScale = 1;

    controls.setElevation = (min: number, max: number) => {
      console.log('controls.setElevation', min, max);

      elevation.min = min;
      elevation.max = max;

      elevationScale = 1 + max / EARTH_RADIUS_METERS;

      elevationGhost.scale.set(elevationScale, elevationScale, elevationScale);
      sphereMaterial.uniforms.displaceScale.value = max;

      setElevationMethod.call(controls, min, max);
    };

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(
      EARTH_RADIUS_METERS * 2,
      EARTH_RADIUS_METERS * 3,
      EARTH_RADIUS_METERS * 1.5,
    );

    scene.add(directionalLight);

    const sphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS_METERS, 128, 128).toNonIndexed();
    const faceColors = new Float32Array(sphereGeometry.attributes.position.count * 3);
    const triangleCount = sphereGeometry.attributes.position.count / 3;

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const color = new THREE.Color(Math.random(), Math.random(), Math.random());
      const base = triangleIndex * 9;

      for (let vertexOffset = 0; vertexOffset < 3; vertexOffset += 1) {
        const colorBase = base + vertexOffset * 3;
        faceColors[colorBase] = color.r;
        faceColors[colorBase + 1] = color.g;
        faceColors[colorBase + 2] = color.b;
      }
    }

    sphereGeometry.setAttribute('color', new THREE.BufferAttribute(faceColors, 3));

    const sphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: textureLoader.load('/tp050630_01.jpg'),
        },
        displaceMap: {
          value: textureLoader.load('/perlin-noise-rgb-256x256.png'),
        },
        displaceScale: {
          value: 0,
        },
      },
      transparent: false,
      visible: true,
      wireframe: false,
      vertexShader: `
        uniform sampler2D displaceMap;
        uniform float displaceScale;

        attribute vec3 color;

        varying vec3 vColor;


        varying vec2 vUv;

        void main() {
          vColor = color;
          vUv = uv;
          vec3 pos = position;
          
          // float h = displaceScale * min(1.0, length(texture2D(displaceMap, uv).rgb));
          // float scale = 1.0 + h / 6371008.0;
          // pos *= scale;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColor;
        varying vec2 vUv;

        void main() {
          vec4 color = texture2D(map, vec2(fract(0.25 + vUv.x), vUv.y));
          gl_FragColor = vec4(color.rgb, 1.0);
        }
      `,
    });

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);
    scene.add(new THREE.AxesHelper(EARTH_RADIUS * 1.5));

    const onResize = () => {
      camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountEl.clientWidth, mountEl.clientHeight, true);
    };

    window.addEventListener('resize', onResize);

    let animationFrameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrameId = window.requestAnimationFrame(animate);
    };

    animate();

    setReady(true);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onResize);

      controlsRef.current = null;
      rendererDomRef.current = null;
      controls.dispose();
      sphere.geometry.dispose();
      sphereMaterial.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950 font-suse-mono text-jade-50">
      <div ref={mountRef} className="h-full w-full" />

      {ready && <WheelGestureOverlay target={rendererDomRef.current} />}

      {ready && <LivePanel scene={sceneRef.current} controls={controlsRef.current} />}
      {ready && <OrbitFactorCharts />}
      {ready && <CameraOperationsTest scene={sceneRef.current} controls={controlsRef.current} />}
    </main>
  );
}

const CameraOperationsTest = memo(
  ({ controls }: { scene: THREE.Scene; controls: ExploreControls }) => {
    return (
      <div className=" p-3 rounded-xl bg-white fixed left-0 top-0 text-black">
        <h1 className=" text-xl font-semibold">Camera Ops Test</h1>
        <div className="  space-y-2  ">
          <CameraOperationsTestAction args="[ 0, 0 ]" action="setElevation" controls={controls} />
          <CameraOperationsTestAction args="12" action="setZoomLevel" controls={controls} />
          {/* <CameraOperationsTestAction args="{lat:12,lng:12}" action="flyTo" controls={controls} /> */}
          <CameraOperationsTestAction
            args="{lat:12,lng:12}"
            action="setLatlng"
            controls={controls}
          />
          {/* <CameraOperationsTestAction args="0" action="setZoomLevel" controls={controls} />
          <CameraOperationsTestAction args="1" action="roll" controls={controls} />
          <CameraOperationsTestAction args="1" action="yaw" controls={controls} />
          <CameraOperationsTestAction args="1" action="pitch" controls={controls} /> */}
        </div>
      </div>
    );
  },
);

const CameraOperationsTestAction = ({
  action,
  controls,
  args,
}: {
  action: string;
  controls: ExploreControls;
  args: string;
}) => {
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [args1, setArgs1] = useState(args);

  const parsedArgs = useMemo(() => {
    try {
      const args0 = eval(`window.____camera_action_args = ${args1 || 'null'}`);

      if (Array.isArray(args0)) {
        return args0;
      }

      return [args0];
    } catch (err_) {
      return undefined;
    }
  }, [args1]);

  const Do = async () => {
    if (phase == 0) {
      setPhase(1);
      await controls[action](...parsedArgs);
      setPhase(2);
      setTimeout(setPhase, 300, 0);
    } else if (phase === 2) {
      //
    }
  };

  return (
    <div
      className={clsx(
        ' relative flex items-center gap-4',
        phase === 1 ? ' pointer-events-none' : '',
      )}
    >
      {action}:{' '}
      <button
        className=" w-20 text-center hover:bg-jade-300 active:border-jade-600 border px-2 py-1 rounded-lg"
        onClick={Do}
      >
        {phase === 0 ? 'do' : phase === 1 ? 'doing' : 'done'}
      </button>
      <div>
        with: (
        <input
          value={args1}
          onChange={(event) => {
            setArgs1(event.target.value.trim());
          }}
          onKeyUp={(event) => {
            if (event.key === 'Enter') {
              if (parsedArgs === undefined) return;
              Do();
            }
          }}
          className=" underline outline-none rounded-lg py-1 "
        />
        )
      </div>
      <p className=" text-sm text-jade-error-400 absolute leading-0 bottom-0">
        {parsedArgs === undefined ? 'args invalid' : null}
      </p>
    </div>
  );
};

const WheelGestureOverlay = ({ target }: { target: HTMLElement | null }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureHueRef = useRef(0);

  useEffect(() => {
    if (!target) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.style.opacity = '0.7';

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const points = pointsRef.current;
      if (points.length < 2) {
        return;
      }

      ctx.beginPath();

      ctx.strokeStyle = `hsl(${gestureHueRef.current} 100% 50%)`;

      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(points[0].x * rect.width, points[0].y * rect.height);

      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x * rect.width, points[i].y * rect.height);
      }

      ctx.stroke();
    };

    const handleWheel = (event: WheelEvent) => {
      if (pointsRef.current.length === 0) {
        cursorRef.current = { x: 0.5, y: 0.5 };
        gestureHueRef.current = Math.random() * 40;
      }

      const sensitivity = 0.002;
      cursorRef.current = {
        x: Math.max(0, Math.min(1, cursorRef.current.x + event.deltaX * sensitivity)),
        y: Math.max(0, Math.min(1, cursorRef.current.y + event.deltaY * sensitivity)),
      };

      pointsRef.current.push({ ...cursorRef.current });
      draw();

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      idleTimerRef.current = setTimeout(() => {
        pointsRef.current = [];
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
      }, 250);
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    resizeCanvas();

    target.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      resizeObserver.disconnect();
      target.removeEventListener('wheel', handleWheel);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [target]);

  return <canvas ref={canvasRef} className="pointer-events-none  absolute right-0 top-0 size-96" />;
};

const LivePanel = memo(({ scene, controls }: { scene: THREE.Scene; controls: ExploreControls }) => {
  const [state, setState] = useState<ExploreControlsLiveState>(controls.liveState);

  useEffect(() => {
    const handle = (state) => {
      setState(state.data);
    };
    controls.addEventListener('state', handle);
    return () => {
      controls.removeEventListener('state', handle);
    };
  });

  return (
    <div className=" fixed bottom-2 left-2">
      <Panel title="Live State" description="">
        <div className=" space-y-1">
          <div>
            elevation:
            {state.elevation.toFixed(3)}
          </div>
          <div>
            lat:
            {state.latlng.lat.toFixed(9)}
          </div>
          <div>lng: {state.latlng.lng.toFixed(9)}</div>
          <div>
            distance: {state.distance.toLocaleString(undefined, { maximumFractionDigits: 2 })} m
          </div>
          <div>
            height: {state.height.toLocaleString(undefined, { maximumFractionDigits: 2 })} m
          </div>
          <div>alt: {state.alt.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</div>
          <div>mode: {state.mode}</div>
          <div>zoom: {state.zoom}</div>
          <OnZoomChange controls={controls} scene={scene} zoom={state.zoom} />
        </div>
      </Panel>
    </div>
  );
});

function getVisibleMetersAtZoom(zoom: number) {
  return 1000000 / Math.pow(2, zoom);
}

const OnZoomChange = memo(
  ({ zoom, scene, controls }: { controls: ExploreControls; scene: THREE.Scene; zoom: number }) => {
    const rulerRef = useRef<THREE.Line>(null);
    const atRef = useRef<THREE.Vector3>(null);
    const basisRef = useRef<{ north: THREE.Vector3; east: THREE.Vector3 }>(null);

    useEffect(() => {
      // create a line

      const latlng = controls.liveState.latlng;
      const at = new THREE.Vector3(0, 0, 0).copy(latlngToSphere(latlng.lat, latlng.lng));
      const basis = getLocalBasisAtPoint(at);
      const zoom = controls.getZoomLevel();

      const lengthMeters = getVisibleMetersAtZoom(zoom);

      atRef.current = at;
      basisRef.current = basis;

      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0).copy(at),
        new THREE.Vector3().copy(basis.east).setLength(lengthMeters).add(at),

        new THREE.Vector3(0, 0, 0).copy(at),
        new THREE.Vector3().copy(basis.east).negate().setLength(lengthMeters).add(at),

        new THREE.Vector3(0, 0, 0).copy(at),
        new THREE.Vector3().copy(basis.north).setLength(lengthMeters).add(at),

        new THREE.Vector3(0, 0, 0).copy(at),
        new THREE.Vector3().copy(basis.north).negate().setLength(lengthMeters).add(at),
      ]);

      const material = new THREE.LineBasicMaterial({
        color: '#fa0',
        depthTest: false,
      });

      const ruler = new THREE.LineSegments(geometry, material);
      ruler.renderOrder = 100;

      scene.add(ruler);

      rulerRef.current = ruler;

      return () => {
        // remove
        scene.remove(ruler);

        geometry.dispose();
        material.dispose();
      };
    }, [scene, controls]);

    useEffect(() => {
      if (!rulerRef.current) return;

      // change size
      const lengthMeters = getVisibleMetersAtZoom(zoom);

      console.log(lengthMeters);

      const at = atRef.current;
      const basis = basisRef.current;

      rulerRef.current.geometry.setFromPoints([
        new THREE.Vector3(0, 0, 0).copy(at),
        new THREE.Vector3().copy(basis.east).setLength(lengthMeters).add(at),

        new THREE.Vector3(0, 0, 0).copy(at),
        new THREE.Vector3().copy(basis.east).negate().setLength(lengthMeters).add(at),

        new THREE.Vector3(0, 0, 0).copy(at),
        new THREE.Vector3().copy(basis.north).setLength(lengthMeters).add(at),

        new THREE.Vector3(0, 0, 0).copy(at),
        new THREE.Vector3().copy(basis.north).negate().setLength(lengthMeters).add(at),
      ]);

      return () => {};
    }, [zoom, scene]);

    return null;
  },
);
