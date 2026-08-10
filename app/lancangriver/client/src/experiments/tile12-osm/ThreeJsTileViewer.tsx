import { useEffect, useRef, useState } from "react";
import { GUI } from "lil-gui";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { TileCoords } from "../../osm/tiles";
import { fitCameraToTileCenter } from "./camera";
import { buildTileVectorGroup } from "./render";
import { BASE_URL } from "../../calc/constants";
import { shaderGlslSegments, uniformSettings } from "./_cfg";

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

type WaterMaskVars = {
  WATER_LUMINANCE_THRESHOLD: number;
  WATER_BLUE_DOMINANCE_OFFSET: number;
  WATER_BLUE_DOMINANCE_SCALE: number;
  WATER_PALETTE_R: number;
  WATER_PALETTE_G: number;
  WATER_PALETTE_B: number;
  WATER_PALETTE_DISTANCE_SCALE: number;
  WATER_PALETTE_BLEND: number;
  WATER_PALETTE_BLUE_WEIGHT: number;
};

type LandClassificationsMask = {
  vars: WaterMaskVars;
  material: THREE.DataTexture;
  refresh: () => void;
};

const GROUND_VERTEX_SHADER = `
varying vec2 vUv;

uniform sampler2D terrianMap;
uniform float terrianMapLoaded;
uniform float groundLowerMeters;

${shaderGlslSegments.decodeTerrariumHeight}

void main() {
  vUv = uv;

  vec3 displacePosition = position;

  if (terrianMapLoaded > 0.5) {
    vec4 rgb = texture2D(terrianMap, uv);
    float heightMeters = decodeTerrariumHeight(rgb);
    displacePosition.y += heightMeters - groundLowerMeters;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacePosition, 1.0);
}
`;

const GROUND_FRAGMENT_SHADER = `
uniform sampler2D uSatelliteTexture;
uniform sampler2D highwayMaskMap;
uniform sampler2D uDerivativesTexture;
uniform float highwayMaskEnabled;
uniform float uDerivativesLoaded;
uniform float uHillshadeStrength;
uniform float uSunAzimuthRad;
uniform float uSunElevationRad;

uniform float stylizeStrength;
uniform float detailKeep;
uniform float saturation;
uniform float brightness;
uniform float contrast;
uniform vec3 waterColor;
uniform vec3 vegetationColor;
uniform vec3 groundColor;
uniform vec3 roadColor;

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

float calcHillshade(vec2 uv) {
  if (uDerivativesLoaded < 0.5) {
    return 1.0;
  }

  vec4 derivatives = texture2D(uDerivativesTexture, uv);
  float slopeDeg = derivatives.r * 90.0;
  float sinAspect = derivatives.g * 2.0 - 1.0;
  float cosAspect = derivatives.b * 2.0 - 1.0;
  float aspectRad = atan(sinAspect, cosAspect);
  if (aspectRad < 0.0) {
    aspectRad += 6.28318530718;
  }

  float slopeRad = radians(slopeDeg);
  float zenith = 1.57079632679 - uSunElevationRad;
  float lit = cos(zenith) * cos(slopeRad)
    + sin(zenith) * sin(slopeRad) * cos(uSunAzimuthRad - aspectRad);
  float hillshade = clamp(lit, 0.0, 1.0);
  return mix(0.72, 1.0, hillshade);
}

void main() {
  vec3 src = texture2D(uSatelliteTexture, vUv).rgb;

  // Global cleanup: gentle contrast/brightness and slight desaturation.
  float luma = dot(src, vec3(0.299, 0.587, 0.114));
  vec3 cleaned = mix(vec3(luma), src, saturation);
  cleaned = (cleaned - 0.5) * contrast + 0.5 + brightness;

  // Class masks.
  float waterMask = calcWaterMask(src);
  float exgr = calcExgr(src);
  float vegetationMask = smoothstep(0.02, 0.14, exgr) * (1.0 - waterMask);

  float roadMask = 0.0;

  if (highwayMaskEnabled > 0.5) {
    roadMask = texture2D(highwayMaskMap, vUv).r;
  }

  // Flat base by class.
  vec3 flatColor = groundColor;

  flatColor = mix(flatColor, vegetationColor, vegetationMask);
  flatColor = mix(flatColor, waterColor, waterMask);
  flatColor = mix(flatColor, roadColor, roadMask);

  // Keep a little luminance detail so the ground is not perfectly flat.
  float detail = mix(1.0, luma * 2.0, detailKeep);
  vec3 stylized = flatColor * detail;

  vec3 outputColor = mix(cleaned, stylized, stylizeStrength);

  float hillshadeFactor = calcHillshade(vUv);
  outputColor *= mix(1.0, hillshadeFactor, uHillshadeStrength);

  gl_FragColor = vec4(outputColor, 1.0);
}
`;

const STENCIL_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STENCIL_FRAGMENT_SHADER = `
uniform sampler2D highwayMaskMap;

varying vec2 vUv;

void main() {
  float mask = texture2D(highwayMaskMap, vUv).r;

  if (mask > 0.5) {
    discard;
  }

  gl_FragColor = vec4(1.0);
}
`;

function createGroundTileMesh(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
  projection: ReturnType<typeof buildTileVectorGroup>["projection"],
  highwayMask: THREE.CanvasTexture | null,
): THREE.Mesh {
  const width = projection.widthMeters;
  const height = projection.heightMeters;

  const geometry = new THREE.PlaneGeometry(width, height, 1024, 1024);

  geometry.rotateX(-Math.PI / 2);

  const texture = textureLoader.load(
    `${BASE_URL}/raster/satellite/${tile.z}/${tile.x}/${tile.y}/clean.jpeg`,
  );

  let material: THREE.ShaderMaterial;
  material = new THREE.ShaderMaterial({
    uniforms: {
      uSatelliteTexture: { value: texture },
      highwayMaskMap: { value: highwayMask },
      highwayMaskEnabled: { value: highwayMask ? 1 : 0 },
      uDerivativesTexture: { value: null },
      uDerivativesLoaded: { value: 0 },
      uHillshadeStrength: { value: 0.7 },
      uSunAzimuthRad: { value: 2.2 },
      uSunElevationRad: { value: 0.85 },
      terrianMap: { value: null },
      terrianMapLoaded: { value: 0 },
      groundLowerMeters: { value: 5.5 },
      stylizeStrength: { value: 0.85 },
      detailKeep: { value: 0.1 },
      saturation: { value: 0.4 },
      brightness: { value: 0.02 },
      contrast: { value: 1.08 },
      waterColor: { value: new THREE.Color("#66a7bd") },
      vegetationColor: { value: new THREE.Color("#9fae0a") },
      groundColor: { value: new THREE.Color("#cfc8b8") },
      roadColor: { value: new THREE.Color("#cfc8b8") },
    },
    vertexShader: GROUND_VERTEX_SHADER,
    fragmentShader: GROUND_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 5,
    polygonOffsetUnits: 2,
    transparent: false,
    visible: true,
  });

  textureLoader.load(
    `${BASE_URL}/raster/dem/${tile.z}/${tile.x}/${tile.y}/derivatives.png`,
    (derivativesTexture) => {
      material.uniforms.uDerivativesTexture.value = derivativesTexture;
      material.uniforms.uDerivativesLoaded.value = 1;
    },
    undefined,
    () => {
      material.uniforms.uDerivativesLoaded.value = 0;
    },
  );

  textureLoader
    .loadAsync(uniformSettings.getTerrariumInfoUrl(tile))
    .then((data) => {
      material.uniforms.terrianMap.value = data;
      material.uniforms.terrianMapLoaded.value = 1;
    });

  if (highwayMask) {
    material.stencilWrite = false;
    material.stencilRef = 1;
    material.stencilFunc = THREE.EqualStencilFunc;
    material.stencilFail = THREE.KeepStencilOp;
    material.stencilZFail = THREE.KeepStencilOp;
    material.stencilZPass = THREE.KeepStencilOp;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;

  if (highwayMask) {
    const stencilMaterial = new THREE.ShaderMaterial({
      uniforms: {
        highwayMaskMap: { value: highwayMask },
      },
      vertexShader: STENCIL_VERTEX_SHADER,
      fragmentShader: STENCIL_FRAGMENT_SHADER,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      colorWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
    });

    const stencilMesh = new THREE.Mesh(geometry.clone(), stencilMaterial);
    stencilMesh.renderOrder = -1;
    mesh.add(stencilMesh);
  }

  return mesh;
}

function createLandClassificationsMask(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
): LandClassificationsMask {
  const vars: WaterMaskVars = {
    // Dark-water gate: higher value marks more dark pixels as possible water.
    // If shadows are falsely treated as water, lower this.
    WATER_LUMINANCE_THRESHOLD: 0.3,

    // Blue-dominance bias: positive value makes water detection easier.
    // Increase if obvious blue water is missed; decrease if non-water gets flagged.
    WATER_BLUE_DOMINANCE_OFFSET: 0.05,

    // Blue-dominance sensitivity: smaller value = stronger response.
    // Lower to make detector more aggressive on blue tones.
    WATER_BLUE_DOMINANCE_SCALE: 0.25,

    // Reference water color (R/G/B) used for color-distance matching.
    // Move these toward your tile provider's typical water color.
    WATER_PALETTE_R: 0.4,
    WATER_PALETTE_G: 0.65,
    WATER_PALETTE_B: 0.78,

    // Palette match tolerance: larger value accepts wider color variation.
    // Increase for rivers/sea with many hues; decrease to be stricter.
    WATER_PALETTE_DISTANCE_SCALE: 1.25,

    // Base weight of palette match in bright-water branch.
    // Increase if clear bright water is missed.
    WATER_PALETTE_BLEND: 0.45,

    // Extra weight from blue dominance in bright-water branch.
    // Increase to trust "blue look" more than palette distance.
    WATER_PALETTE_BLUE_WEIGHT: 0.55,
  };

  const fallbackData = new Uint8Array([0, 0, 0, 255]);
  const maskTexture = new THREE.DataTexture(
    fallbackData,
    1,
    1,
    THREE.RGBAFormat,
  );
  maskTexture.wrapS = THREE.ClampToEdgeWrapping;
  maskTexture.wrapT = THREE.ClampToEdgeWrapping;
  maskTexture.minFilter = THREE.LinearFilter;
  maskTexture.magFilter = THREE.LinearFilter;
  maskTexture.generateMipmaps = false;
  // Defer first upload until real tile-sized mask data is ready.

  const calcExgr = (r: number, g: number, b: number): number => {
    const total = r + g + b + 0.000001;
    const rn = r / total;
    const gn = g / total;
    const bn = b / total;
    const exg = 2 * gn - rn - bn;
    const exr = 1.4 * rn - gn;
    return exg - exr;
  };

  const clamp01 = (value: number): number => {
    return Math.max(0, Math.min(1, value));
  };

  const calcWaterMask = (r: number, g: number, b: number): number => {
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const blueDominance = clamp01(
      (b - Math.max(r, g) + vars.WATER_BLUE_DOMINANCE_OFFSET) /
        vars.WATER_BLUE_DOMINANCE_SCALE,
    );
    const waterPalette = clamp01(
      1 -
        (Math.abs(r - vars.WATER_PALETTE_R) +
          Math.abs(g - vars.WATER_PALETTE_G) +
          Math.abs(b - vars.WATER_PALETTE_B)) /
          vars.WATER_PALETTE_DISTANCE_SCALE,
    );
    const darkWater =
      clamp01(
        (vars.WATER_LUMINANCE_THRESHOLD - luminance) /
          vars.WATER_LUMINANCE_THRESHOLD,
      ) * blueDominance;
    const brightWater =
      waterPalette *
      (vars.WATER_PALETTE_BLEND +
        vars.WATER_PALETTE_BLUE_WEIGHT * blueDominance);

    return clamp01(Math.max(darkWater, brightWater));
  };

  let sourceImageData: ImageData | null = null;

  const refresh = () => {
    if (!sourceImageData) {
      return;
    }

    const { data: src, width, height } = sourceImageData;
    const dst = new Uint8Array(width * height * 4);

    for (let i = 0; i < width * height; i++) {
      const srcOffset = i * 4;
      const r = src[srcOffset] / 255;
      const g = src[srcOffset + 1] / 255;
      const b = src[srcOffset + 2] / 255;

      const waterMask = calcWaterMask(r, g, b);
      const exgr = calcExgr(r, g, b);
      const vegetation = clamp01((exgr + 1) * 0.5) * (1 - waterMask);
      const value = Math.round(vegetation * 255);

      dst[srcOffset] = value;
      dst[srcOffset + 1] = 0;
      dst[srcOffset + 2] = 0;
      dst[srcOffset + 3] = 255;
    }

    maskTexture.image = { data: dst, width, height };
    maskTexture.needsUpdate = true;
  };

  const satelliteTexture = textureLoader.load(
    `${BASE_URL}/raster/satellite/${tile.z}/${tile.x}/${tile.y}.jpeg`,
    () => {
      const image = satelliteTexture.image as
        | ImageBitmap
        | HTMLImageElement
        | HTMLCanvasElement
        | OffscreenCanvas
        | undefined;

      const width = image?.width ?? 0;
      const height = image?.height ?? 0;

      if (!image || width < 1 || height < 1) {
        satelliteTexture.dispose();
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) {
        satelliteTexture.dispose();
        return;
      }

      ctx.drawImage(image, 0, 0);
      sourceImageData = ctx.getImageData(0, 0, width, height);
      refresh();
      satelliteTexture.dispose();
    },
    undefined,
    () => {
      satelliteTexture.dispose();
    },
  );

  return {
    vars,
    material: maskTexture,
    refresh,
  };
}

function createWaterMaskGui(mask: LandClassificationsMask): GUI {
  const gui = new GUI({ title: "Water Mask" });
  const folder = gui.addFolder("Tuning");

  folder
    .add(mask.vars, "WATER_LUMINANCE_THRESHOLD", 0, 1, 0.01)
    .name("dark gate")
    .onChange(mask.refresh);
  folder
    .add(mask.vars, "WATER_BLUE_DOMINANCE_OFFSET", -0.2, 0.3, 0.01)
    .name("blue bias")
    .onChange(mask.refresh);
  folder
    .add(mask.vars, "WATER_BLUE_DOMINANCE_SCALE", 0.05, 1, 0.01)
    .name("blue scale")
    .onChange(mask.refresh);
  folder
    .add(mask.vars, "WATER_PALETTE_R", 0, 1, 0.01)
    .name("palette R")
    .onChange(mask.refresh);
  folder
    .add(mask.vars, "WATER_PALETTE_G", 0, 1, 0.01)
    .name("palette G")
    .onChange(mask.refresh);
  folder
    .add(mask.vars, "WATER_PALETTE_B", 0, 1, 0.01)
    .name("palette B")
    .onChange(mask.refresh);
  folder
    .add(mask.vars, "WATER_PALETTE_DISTANCE_SCALE", 0.1, 3, 0.01)
    .name("palette range")
    .onChange(mask.refresh);
  folder
    .add(mask.vars, "WATER_PALETTE_BLEND", 0, 1, 0.01)
    .name("palette weight")
    .onChange(mask.refresh);
  folder
    .add(mask.vars, "WATER_PALETTE_BLUE_WEIGHT", 0, 1, 0.01)
    .name("blue weight")
    .onChange(mask.refresh);

  folder.open();
  return gui;
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

  const uvAttr = new THREE.Float32BufferAttribute(new Array(2 * n).fill(0), 2);

  const treesMetadataAttr = new THREE.Float32BufferAttribute(
    new Array(3 * n).fill(0),
    3,
  );

  const treesAltas = textureLoader.load("/trees_in-one.png");
  const landClsMask = createLandClassificationsMask(textureLoader, tile);

  for (let x = 0; x < nX; x++) {
    for (let z = 0; z < nZ; z++) {
      const i = x * nZ + z;

      const px = -width / 2 + Math.random() * width;
      const pz = -height / 2 + Math.random() * height;

      pointsAttr.setXYZ(i, px, 0, pz);

      const u = THREE.MathUtils.clamp((px + width / 2) / width, 0, 1);
      const v = THREE.MathUtils.clamp((pz + height / 2) / height, 0, 1);
      uvAttr.setXY(i, u, v);

      treesMetadataAttr.setXYZ(
        i,
        Math.floor(Math.random() * 8),
        Math.floor(Math.random() * 8),
        0.5 + Math.random() * 0.5,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", pointsAttr);
  geometry.setAttribute("metadata", treesMetadataAttr);
  geometry.setAttribute("uv", uvAttr);

  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: treesAltas,
        },
        landClsMask: {
          value: landClsMask.material,
        },
      },
      vertexShader: `
    attribute vec3 metadata;

    flat out vec3 vMetadata;
    varying vec2 vUv;

    void main() {
      vec3 ipos = position.xyz;
      vec4 mvPos = modelViewMatrix * vec4(ipos, 1.0);

      float size_factor = metadata.b * 30000.0;
      gl_PointSize = size_factor / -mvPos.z;

      mvPos.y += 10.0;

      vMetadata = metadata;
      vUv = uv;

      gl_Position = projectionMatrix * vec4(mvPos.xyz, 1.0);
    }
    `,
      fragmentShader: `
    uniform sampler2D map;
    uniform sampler2D landClsMask;

    flat in vec3 vMetadata;
    varying vec2 vUv;

    void main() {
      float isVegetation = texture2D(landClsMask, vUv).r;

      if (isVegetation < 0.26) discard;
      gl_FragColor = vec4(isVegetation, 0.0, 0.0, 1.0);

      // if (isVegetation < 0.3) discard;

      // vec2 uv = gl_PointCoord;

      // uv.y = 1.0 - uv.y;
      // vec2 uv_offset = 0.125 * vec2(vMetadata.r, vMetadata.g);
      // uv = uv_offset  +  0.125 * uv;
      
      // vec4 baseColor = texture2D(map, uv);

      // if (baseColor.a < 0.5) discard;

      // vec3 outputColor = baseColor.rgb;
      // outputColor *= 0.56;

      // gl_FragColor = vec4(outputColor, 1.0);
    }
    `,
    }),
  );

  return {
    points,
    landClsMask,
  };
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
    const derivativesUniform = material.uniforms.uDerivativesTexture;
    if (derivativesUniform?.value instanceof THREE.Texture) {
      derivativesUniform.value.dispose();
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
      renderedTile.getHighwayBWMask(),
    );
    viewer.scene.add(viewer.groundTile);

    // const trees = createPointsTrees(
    //   textureLoader,
    //   tile,
    //   renderedTile.projection,
    // );

    // waterMaskGuiRef.current?.destroy();
    // waterMaskGuiRef.current = createWaterMaskGui(trees.landClsMask);

    // viewer.scene.add(trees.points);

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
