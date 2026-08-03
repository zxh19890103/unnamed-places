import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { TileCoords } from "../../osm/tiles";
import { fitCameraToTileCenter } from "./camera";
import { buildTileVectorGroup } from "./render";

type ThreeJsTileViewerProps = {
  features: GeoJSON.Feature[];
  tile: TileCoords | null;
};

type Viewer = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  axesHelper: THREE.AxesHelper;
  gridHelper: THREE.GridHelper;
  groundTile: THREE.Mesh | null;
  currentTile: ReturnType<typeof buildTileVectorGroup> | null;
};

// Tune vector/raster alignment with per-axis flips.
// Common cases: flip Z only, or flip both X+Z.
const VECTOR_TILE_FLIP_X = false;
const VECTOR_TILE_FLIP_Z = true;

const GROUND_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GROUND_FRAGMENT_SHADER = `
uniform sampler2D uSatelliteTexture;
uniform sampler2D landMap;

varying vec2 vUv;

float calcExgr(vec3 rgb) {
  float total = rgb.r + rgb.g + rgb.b + 0.000001;

  float rn = rgb.r / total;
  float gn = rgb.g / total;
  float bn = rgb.b / total;

  float exg = 2.0 * gn - rn - bn;
  float exr = 1.4 * rn - gn;
  float exgr = exg - exr;

  return exgr;
}

float calcWaterMask(vec3 rgb) {
  vec3 targetWater = vec3(102.0 / 255.0, 167.0 / 255.0, 189.0 / 255.0); // #66a7bd
  float colorDistance = distance(rgb, targetWater);
  return 1.0 - smoothstep(0.08, 0.16, colorDistance);
}

void main() {
  vec4 color = texture2D(uSatelliteTexture, vUv);

  float exgr = calcExgr(color.rgb);
  float waterMask = calcWaterMask(color.rgb);
  float vegMask = step(0.23, exgr);

  vec3 vegetation = vec3(0.1, 0.83, 0.4);
  vec3 water = vec3(0.1, 0.5, 0.8);

  vec4 soilColor = texture2D(landMap, fract(vUv * 70.0));
  vec3 outputColor = soilColor.rgb * 1.31;

  outputColor = mix(outputColor, vegetation, vegMask * (1.0 - waterMask));
  outputColor = mix(outputColor, water, waterMask);

  gl_FragColor = vec4(outputColor, 1.0);
}
`;

function createGroundTileMesh(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
  projection: ReturnType<typeof buildTileVectorGroup>["projection"],
): THREE.Mesh {
  const width = projection.widthMeters;
  const height = projection.heightMeters;
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.rotateX(-Math.PI / 2);

  const texture = textureLoader.load(
    `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`,
  );
  texture.colorSpace = THREE.SRGBColorSpace;

  const cityGround = textureLoader.load("/city-ground.webp");

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSatelliteTexture: { value: texture },
      landMap: { value: cityGround },
    },
    vertexShader: GROUND_VERTEX_SHADER,
    fragmentShader: GROUND_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    visible: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, -0.03, 0);
  mesh.renderOrder = -1;
  return mesh;
}

function createPointsTrees(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
  projection: ReturnType<typeof buildTileVectorGroup>["projection"],
) {
  const width = projection.widthMeters;
  const height = projection.heightMeters;

  const nX = 150;
  const nZ = 150;

  const n = Math.floor(nX * nZ);

  const pointsAttr = new THREE.Float32BufferAttribute(
    new Array(3 * n).fill(0),
    3,
  );

  const treesMetadata = new THREE.Float32BufferAttribute(
    new Array(3 * n).fill(0),
    3,
  );

  const treesAltas = textureLoader.load("/trees_in-one.png");

  for (let x = 0; x < nX; x++) {
    for (let z = 0; z < nZ; z++) {
      const i = x * nZ + z;

      pointsAttr.setXYZ(
        i,
        -width / 2 + Math.random() * width,
        0,
        -height / 2 + Math.random() * height,
      );

      treesMetadata.setXYZ(
        i,
        Math.floor(Math.random() * 8),
        Math.floor(Math.random() * 8),
        0.5 + Math.random() * 0.5,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", pointsAttr);
  geometry.setAttribute("metadata", treesMetadata);

  return new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: treesAltas,
        },
      },
      vertexShader: `
    attribute vec3 metadata;

    flat out vec3 vMetadata;

    void main() {
      vec3 ipos = position.xyz;
      vec4 vPos = modelViewMatrix * vec4(ipos, 1.0);

      float size_factor = metadata.b * 30000.0;
      gl_PointSize = size_factor / -vPos.z;

      vPos.y += 10.0;

      vMetadata = metadata;

      gl_Position = projectionMatrix * vec4(vPos.xyz, 1.0);
    }
    `,
      fragmentShader: `
    uniform sampler2D map;
    flat in vec3 vMetadata;

    void main() {

      vec2 uv = gl_PointCoord;

      uv.y = 1.0 - uv.y;
      vec2 uv_offset = 0.125 * vec2(vMetadata.r, vMetadata.g);
      uv = uv_offset  +  0.125 * uv;
      
      vec4 baseColor = texture2D(map, uv);

      if (baseColor.a < 0.5) discard;

      vec3 outputColor = baseColor.rgb;
      outputColor *= 0.56;

      gl_FragColor = vec4(outputColor, 1.0);
    }
    `,
    }),
  );
}

function disposeGroundTile(mesh: THREE.Mesh | null): void {
  if (!mesh) {
    return;
  }

  mesh.geometry.dispose();
  const material = mesh.material;
  if (material instanceof THREE.ShaderMaterial) {
    const mapUniform = material.uniforms.uSatelliteTexture;
    if (mapUniform?.value instanceof THREE.Texture) {
      mapUniform.value.dispose();
    }
    material.dispose();
    return;
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    material.map?.dispose();
    material.dispose();
  }
}

const textureLoaderFactory = () => {
  return new THREE.TextureLoader(new THREE.LoadingManager());
};

export function ThreeJsTileViewer({ features, tile }: ThreeJsTileViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [textureLoader] = useState<THREE.TextureLoader>(textureLoaderFactory);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ffffff");

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
    camera.lookAt(controls.target);
    controls.update();

    const axesHelper = new THREE.AxesHelper(1_000);
    const gridHelper = new THREE.GridHelper(1_000, 10, "#ef0fea", "#ffffff");

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
      axesHelper,
      gridHelper,
      groundTile: null,
      currentTile: null,
    };

    return () => {
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
    const renderedTile = buildTileVectorGroup(features, tile);
    renderedTile.group.scale.set(
      VECTOR_TILE_FLIP_X ? -1 : 1,
      1,
      VECTOR_TILE_FLIP_Z ? -1 : 1,
    );

    viewer.currentTile = renderedTile;

    viewer.groundTile = createGroundTileMesh(
      textureLoader,
      tile,
      renderedTile.projection,
    );

    const trees = createPointsTrees(
      textureLoader,
      tile,
      renderedTile.projection,
    );

    viewer.scene.add(trees);

    viewer.scene.add(viewer.groundTile);
    viewer.scene.add(renderedTile.group);
    const tileCenter = new THREE.Box3()
      .setFromObject(renderedTile.group)
      .getCenter(new THREE.Vector3());
    viewer.axesHelper.position.copy(tileCenter);
    viewer.gridHelper.position.copy(tileCenter);
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
