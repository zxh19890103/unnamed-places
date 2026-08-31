import { memo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  deriveMetersByZoomingDeltaPixel,
  deriveSensitivityFromRotationDelta,
  ExploreControls,
  ExploreControlsLiveState,
} from '@/explore/controls/ExploreControls.class.js';

import '@/styles.css';
import { EARTH_RADIUS } from '@/calc/constants';
import { Button, Panel } from '@/_components';

const EARTH_RADIUS_METERS = 6_371_000;

export default function App() {
  const [ready, setReady] = useState(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<ExploreControls | null>(null);

  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [alt, setAlt] = useState(1000);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020817);

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

    camera.position.setLength(EARTH_RADIUS_METERS * 3.5);

    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight, true);
    mountEl.appendChild(renderer.domElement);

    const controls = new ExploreControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;

    // controls.minDistance = EARTH_RADIUS_METERS * 1.1;
    // controls.maxDistance = EARTH_RADIUS_METERS * 10;

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

    const textureLoader = new THREE.TextureLoader();
    const sphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: textureLoader.load('/dcrbmun-38493001-d0cc-4bd6-9acb-2bf1109b488b.jpg'),
        },
      },
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;

        varying vec2 vUv;

        void main() {
          vColor = color;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColor;
        varying vec2 vUv;

        void main() {
          vec4 color = texture2D(map, vec2(fract(0.25 + vUv.x), vUv.y));
          gl_FragColor = vec4(vColor, 1.0);
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
      controls.dispose();
      sphere.geometry.dispose();
      sphereMaterial.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const nextLat = Number(lat);
    const nextLng = Number(lng);
    const nextAlt = Number(alt);

    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng) || !Number.isFinite(nextAlt)) {
      return;
    }

    const form = event.target as HTMLButtonElement;

    if (form.value === 'low') {
      controlsRef.current?.setObjectAtLowAlt({ lat: nextLat, lng: nextLng }, nextAlt);
    } else {
      controlsRef.current?.setObjectAt({ lat: nextLat, lng: nextLng }, 50_000000);
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950 font-suse-mono text-jade-50">
      <div ref={mountRef} className="h-full w-full" />
      <header className="absolute left-2 top-2">
        <Panel defaultMinimized title="Explore Controls" description="">
          <p className="mt-2 text-[13px]">
            Sphere radius: {EARTH_RADIUS_METERS.toLocaleString()} m
          </p>

          <form onSubmit={(e) => e.preventDefault()} className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em]">
                Lat
                <NumberInput value={lat} onChange={setLat} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em]">
                Lng
                <NumberInput value={lng} onChange={setLng} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em]">
                Alt
                <NumberInput value={alt} onChange={setAlt} />
              </label>
            </div>

            <div className=" space-x-1">
              <Button type="submit" onClick={handleSubmit} value="high">
                Set view
              </Button>
              <Button type="submit" onClick={handleSubmit} value="low">
                Set view (low)
              </Button>
            </div>
          </form>
        </Panel>
      </header>

      {ready && <LivePanel controls={controlsRef.current} />}
      {ready && <ZoomFactorCharts />}
      {ready && <RotateFactorCharts />}
    </main>
  );
}

const NumberInput = ({ value, onChange }) => {
  return (
    <input
      type="number"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-slate-400/40 bg-slate-800/10 px-2 py-1.5 text-sm text-jade-950 outline-none transition focus:border-jade-600 focus:ring-2 focus:ring-jade-600/30"
    />
  );
};

const LivePanel = memo(({ controls }: { controls: ExploreControls }) => {
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
          <div>lat: {state.latlng.lat.toFixed(9)}</div>
          <div>lng: {state.latlng.lng.toFixed(9)}</div>
          <div>far: {state.distance.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</div>
          <div>alt: {state.alt.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</div>
          <div>mode: {state.mode}</div>
        </div>
      </Panel>
    </div>
  );
});

const ZoomFactorCharts = memo(() => {
  const [data] = useState(() => {
    const ticks = 30;
    const maxFar = 500_000;
    const step = maxFar / ticks;
    return new Array(30).fill(0).map((_, i) => {
      const far = step * i;
      return [far, deriveMetersByZoomingDeltaPixel(1, far)] as [number, number];
    });
  });

  const width = 320;
  const height = 180;
  const padding = { top: 16, right: 16, bottom: 28, left: 42 };

  const xs = data.map(([far]) => far);
  const ys = data.map(([, value]) => value);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys);

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const xToSvg = (x: number) => {
    if (maxX === minX) {
      return padding.left + innerWidth / 2;
    }
    return padding.left + ((x - minX) / (maxX - minX)) * innerWidth;
  };

  const yToSvg = (y: number) => {
    if (maxY === minY) {
      return height - padding.bottom - innerHeight / 2;
    }
    return height - padding.bottom - ((y - minY) / (maxY - minY)) * innerHeight;
  };

  const linePath = data
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${xToSvg(x)} ${yToSvg(y)}`)
    .join(' ');

  const xTicks = [minX, (minX + maxX) / 2, maxX];
  const yTicks = [minY, (minY + maxY) / 2, maxY];

  const formatNumber = (value: number) => {
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toFixed(1);
  };

  return (
    <div className="fixed right-2 bottom-2 ">
      <Panel defaultMinimized title="Far - Zoom Sensitivity" description="">
        <div className="w-75">
          <svg viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
            <rect x="0" y="0" width={width} height={height} fill="transparent" />
            <line
              x1={padding.left}
              y1={height - padding.bottom}
              x2={width - padding.right}
              y2={height - padding.bottom}
              stroke="#000"
              strokeWidth="1"
            />
            <line
              x1={padding.left}
              y1={padding.top}
              x2={padding.left}
              y2={height - padding.bottom}
              stroke="#000"
              strokeWidth="1"
            />

            {xTicks.map((tick) => {
              const x = xToSvg(tick);
              return (
                <g key={`x-${tick}`}>
                  <line
                    x1={x}
                    y1={height - padding.bottom}
                    x2={x}
                    y2={height - padding.bottom + 5}
                    stroke="#000"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={height - 8}
                    textAnchor="middle"
                    fill="#000"
                    fontSize="9"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {formatNumber(tick)}
                  </text>
                </g>
              );
            })}

            {yTicks.map((tick) => {
              const y = yToSvg(tick);
              return (
                <g key={`y-${tick}`}>
                  <line
                    x1={padding.left - 5}
                    y1={y}
                    x2={padding.left}
                    y2={y}
                    stroke="#000"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 3}
                    textAnchor="end"
                    fill="#000"
                    fontSize="9"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {formatNumber(tick)}
                  </text>
                </g>
              );
            })}
            <path d={linePath} fill="none" stroke="#000" strokeWidth="1.2" />
          </svg>
        </div>
      </Panel>
    </div>
  );
});

const RotateFactorCharts = memo(() => {
  const [data] = useState(() => {
    const ticks = 30;
    const maxFar = 500_000;
    const step = maxFar / ticks;
    return new Array(30).fill(0).map((_, i) => {
      const far = step * i;
      return [far, deriveSensitivityFromRotationDelta(1, 1, far)] as [number, number];
    });
  });

  const width = 320;
  const height = 180;
  const padding = { top: 16, right: 16, bottom: 28, left: 42 };

  const xs = data.map(([far]) => far);
  const ys = data.map(([, value]) => value);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys);

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const xToSvg = (x: number) => {
    if (maxX === minX) {
      return padding.left + innerWidth / 2;
    }
    return padding.left + ((x - minX) / (maxX - minX)) * innerWidth;
  };

  const yToSvg = (y: number) => {
    if (maxY === minY) {
      return height - padding.bottom - innerHeight / 2;
    }
    return height - padding.bottom - ((y - minY) / (maxY - minY)) * innerHeight;
  };

  const linePath = data
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${xToSvg(x)} ${yToSvg(y)}`)
    .join(' ');

  const xTicks = [minX, (minX + maxX) / 2, maxX];
  const yTicks = [minY, (minY + maxY) / 2, maxY];

  const formatNumber = (value: number) => {
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toFixed(1);
  };

  return (
    <div className="fixed right-2 top-2 ">
      <Panel defaultMinimized title="Far - Orbit Sensitivity" description="">
        <div className="w-75">
          <svg viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
            <rect x="0" y="0" width={width} height={height} fill="transparent" />
            <line
              x1={padding.left}
              y1={height - padding.bottom}
              x2={width - padding.right}
              y2={height - padding.bottom}
              stroke="#000"
              strokeWidth="1"
            />
            <line
              x1={padding.left}
              y1={padding.top}
              x2={padding.left}
              y2={height - padding.bottom}
              stroke="#000"
              strokeWidth="1"
            />

            {xTicks.map((tick) => {
              const x = xToSvg(tick);
              return (
                <g key={`x-${tick}`}>
                  <line
                    x1={x}
                    y1={height - padding.bottom}
                    x2={x}
                    y2={height - padding.bottom + 5}
                    stroke="#000"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={height - 8}
                    textAnchor="middle"
                    fill="#000"
                    fontSize="9"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {formatNumber(tick)}
                  </text>
                </g>
              );
            })}

            {yTicks.map((tick) => {
              const y = yToSvg(tick);
              return (
                <g key={`y-${tick}`}>
                  <line
                    x1={padding.left - 5}
                    y1={y}
                    x2={padding.left}
                    y2={y}
                    stroke="#000"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 3}
                    textAnchor="end"
                    fill="#000"
                    fontSize="9"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {formatNumber(tick)}
                  </text>
                </g>
              );
            })}
            <path d={linePath} fill="none" stroke="#000" strokeWidth="1.2" />
          </svg>
        </div>
      </Panel>
    </div>
  );
});
