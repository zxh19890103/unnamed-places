import * as THREE from "three";
import { shaderGlslSegments, uniformSettings } from "../_cfg.js";
import { TileCoords } from "@/tile12-osm/vector-tiles.js";
import { BASE_URL } from "@/calc/constants.js";
import { TileProjection } from "../tile.js";
import { GUI } from "lil-gui";

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
  texture: THREE.DataTexture;
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
uniform sampler2D uSatelliteImageryMap;
uniform sampler2D highwayMaskMap;
uniform sampler2D noiseMap;
uniform sampler2D uDerivativesMap;
uniform float highwayMaskEnabled;
uniform float uDerivativesLoaded;
uniform float uHillshadeStrength;
uniform float uSunAzimuthRad;
uniform float uSunElevationRad;
uniform float uNoiseLoaded;
uniform float uNoiseMacroTiling;
uniform float uNoiseDetailTiling;
uniform float uNoiseStrength;

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

  vec4 derivatives = texture2D(uDerivativesMap, uv);
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

// Two decorrelated perlin octaves (macro patches + fine grain), centered on 0.
float calcGroundNoise(vec2 uv) {
  if (uNoiseLoaded < 0.5) {
    return 0.0;
  }

  float macro = texture2D(noiseMap, uv * uNoiseMacroTiling).r;
  float detail = texture2D(noiseMap, uv * uNoiseDetailTiling + vec2(0.37, 0.71)).g;

  return (macro - 0.5) * 0.7 + (detail - 0.5) * 0.3;
}

void main() {
  vec3 src = texture2D(uSatelliteImageryMap, vUv).rgb;

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

  // Break up the flat vegetation color with tiled noise; other classes stay clean.
  float groundNoise = calcGroundNoise(vUv);
  float noiseAmount = clamp(uNoiseStrength, 0.0, 1.0) * vegetationMask * (1.0 - roadMask);
  float noiseValue = groundNoise * noiseAmount;

  vec3 warmTint = vec3(1.08, 1.0, 0.88);
  vec3 coolTint = vec3(0.92, 0.98, 1.06);
  vec3 noiseTint = mix(coolTint, warmTint, clamp(groundNoise * 2.0 + 0.5, 0.0, 1.0));
  flatColor *= mix(vec3(1.0), noiseTint, clamp(abs(noiseValue) * 2.0, 0.0, 1.0));
  flatColor *= 1.0 + noiseValue;

  // Keep a little luminance detail so the ground is not perfectly flat.
  float detail = mix(1.0, luma * 2.0, detailKeep);
  vec3 stylized = flatColor * detail;

  vec3 outputColor = mix(cleaned, stylized, stylizeStrength);

  float hillshadeFactor = calcHillshade(vUv);
  outputColor *= mix(1.0, hillshadeFactor, uHillshadeStrength);

  gl_FragColor = vec4(outputColor, 1.0);
}
`;

const GROUND_NOISE_TEXTURE_URL = "/perlin-noise-rgb-256x256.png";

// Shared across tiles; never disposed with an individual tile.
let groundNoiseTexturePromise: Promise<THREE.Texture> | null = null;

function loadGroundNoiseTexture(
  textureLoader: THREE.TextureLoader,
): Promise<THREE.Texture> {
  if (!groundNoiseTexturePromise) {
    groundNoiseTexturePromise = textureLoader
      .loadAsync(GROUND_NOISE_TEXTURE_URL)
      .then((texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.NoColorSpace;
        texture.needsUpdate = true;
        return texture;
      });
  }

  return groundNoiseTexturePromise;
}

export function createGroundTileMesh(
  textureLoader: THREE.TextureLoader,
  tile: TileCoords,
  projection: TileProjection,
  highwayMask: THREE.CanvasTexture | null,
): THREE.Mesh {
  const width = projection.widthMeters;
  const height = projection.heightMeters;

  const geometry = new THREE.PlaneGeometry(
    width,
    height,
    uniformSettings.GROUND_UV_GRID_SIZE,
    uniformSettings.GROUND_UV_GRID_SIZE,
  );

  geometry.rotateX(-Math.PI / 2);

  const texture = textureLoader.load(
    `${BASE_URL}/raster/satellite/${tile.z}/${tile.x}/${tile.y}/clean.jpeg`,
  );

  let material: THREE.ShaderMaterial;
  material = new THREE.ShaderMaterial({
    uniforms: {
      uSatelliteImageryMap: { value: texture },
      highwayMaskMap: { value: highwayMask },
      highwayMaskEnabled: { value: highwayMask ? 1 : 0 },
      uDerivativesMap: { value: null },
      uDerivativesLoaded: { value: 0 },
      uHillshadeStrength: { value: 0.9 },
      uSunAzimuthRad: { value: 2.2 },
      uSunElevationRad: { value: 0.85 },
      terrianMap: { value: null },
      noiseMap: { value: null },
      uNoiseLoaded: { value: 0 },
      uNoiseMacroTiling: { value: 80 },
      uNoiseDetailTiling: { value: 160 },
      uNoiseStrength: { value: 1 },
      terrianMapLoaded: { value: 0 },
      groundLowerMeters: { value: 0 },
      stylizeStrength: { value: 0.85 },
      detailKeep: { value: 0.1 },
      saturation: { value: 0.1 },
      brightness: { value: 0.9 },
      contrast: { value: 1.38 },
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
    polygonOffsetFactor: 3,
    polygonOffsetUnits: 2,
    transparent: false,
    visible: true,
  });

  textureLoader.load(
    `${BASE_URL}/raster/dem/${tile.z}/${tile.x}/${tile.y}/derivatives.png`,
    (derivativesTexture) => {
      material.uniforms.uDerivativesMap.value = derivativesTexture;
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

  loadGroundNoiseTexture(textureLoader)
    .then((noiseTexture) => {
      material.uniforms.noiseMap.value = noiseTexture;
      material.uniforms.uNoiseLoaded.value = 1;
    })
    .catch(() => {
      material.uniforms.uNoiseLoaded.value = 0;
    });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;

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
    texture: maskTexture,
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

export function disposeGroundTile(mesh: THREE.Mesh | null): void {
  if (!mesh) {
    return;
  }

  mesh.geometry.dispose();
  const material = mesh.material;
  if (material instanceof THREE.ShaderMaterial) {
    const mapUniform = material.uniforms.uSatelliteImageryMap;
    if (mapUniform?.value instanceof THREE.Texture) {
      mapUniform.value.dispose();
    }
    const derivativesUniform = material.uniforms.uDerivativesMap;
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
