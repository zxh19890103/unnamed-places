import * as THREE from 'three';
import { latLngToMetersOffset, LatLng } from './_fns';
import { DemAtlas } from './_demAtlas';

export interface PlaceLodConfig {
  maxDistance: number;
  fadeDistance: number;
}

export interface PlaceRenderOptions {
  elevationOffset?: number;
  viewportSize?: { value: THREE.Vector2 };
  lodConfig?: Partial<Record<string, PlaceLodConfig>>;
}

export type PlacesGroup = THREE.Group & {
  updateViewport: (width: number, height: number) => void;
};

/**
 * Global scale multiplier for place label sprites on screen.
 * Increase to scale all place badges up proportionally (e.g. 1.5, 2.0).
 */
export const PLACE_LABEL_SCALE = 1.6;

/**
 * Configurable Level of Detail (LOD) distance thresholds (in meters) per place category.
 * - maxDistance: Distance from camera where the label is completely culled / invisible.
 * - fadeDistance: Distance buffer over which the label smoothly fades out (from 1.0 to 0.0 opacity).
 */
export const DEFAULT_PLACE_LOD_CONFIG: Record<string, PlaceLodConfig> = {
  city: {
    maxDistance: 60_000,
    fadeDistance: 15_000,
  },
  town: {
    maxDistance: 25_000,
    fadeDistance: 6_000,
  },
  suburb: {
    maxDistance: 25_000,
    fadeDistance: 6_000,
  },
  village: {
    maxDistance: 12_000,
    fadeDistance: 3_000,
  },
  hamlet: {
    maxDistance: 7_000,
    fadeDistance: 2_000,
  },
  neighbourhood: {
    maxDistance: 7_000,
    fadeDistance: 2_000,
  },
  locality: {
    maxDistance: 5_500,
    fadeDistance: 1_500,
  },
  isolated_dwelling: {
    maxDistance: 4_500,
    fadeDistance: 1_200,
  },
};

type PlaceCategoryStyle = {
  priority: number;
  color: string;
  subColor: string;
  fontSize: number;
  subFontSize: number;
  haloWidth: number;
  screenHeight: number;
};

const PLACE_RANKS: Record<string, PlaceCategoryStyle> = {
  city: {
    priority: 1,
    color: '#ffdd00', // Vibrant Gold
    subColor: '#fff3a8',
    fontSize: 54,
    subFontSize: 24,
    haloWidth: 10,
    screenHeight: 44,
  },
  town: {
    priority: 2,
    color: '#38bdf8', // Sky Blue
    subColor: '#bae6fd',
    fontSize: 44,
    subFontSize: 20,
    haloWidth: 8,
    screenHeight: 36,
  },
  suburb: {
    priority: 2,
    color: '#fb923c', // Orange
    subColor: '#fed7aa',
    fontSize: 44,
    subFontSize: 20,
    haloWidth: 8,
    screenHeight: 36,
  },
  village: {
    priority: 3,
    color: '#4ade80', // Mint/Emerald Green
    subColor: '#bbf7d0',
    fontSize: 38,
    subFontSize: 18,
    haloWidth: 7,
    screenHeight: 30,
  },
  hamlet: {
    priority: 4,
    color: '#facc15', // Warm Ochre
    subColor: '#fef08a',
    fontSize: 32,
    subFontSize: 16,
    haloWidth: 6,
    screenHeight: 26,
  },
  neighbourhood: {
    priority: 4,
    color: '#f472b6', // Rose
    subColor: '#fbcfe8',
    fontSize: 32,
    subFontSize: 16,
    haloWidth: 6,
    screenHeight: 26,
  },
  locality: {
    priority: 5,
    color: '#f1f5f9', // Clean White / Light Slate
    subColor: '#cbd5e1',
    fontSize: 28,
    subFontSize: 15,
    haloWidth: 6,
    screenHeight: 22,
  },
  isolated_dwelling: {
    priority: 5,
    color: '#cbd5e1', // Muted Slate
    subColor: '#94a3b8',
    fontSize: 26,
    subFontSize: 14,
    haloWidth: 5,
    screenHeight: 20,
  },
};

const placeSpriteVertexShader = /* glsl */ `
  uniform vec2 screenSize;
  uniform vec2 viewport;
  uniform float maxDistance;
  uniform float fadeDistance;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    vUv = uv;

    // 1. Calculate eye-space distance from camera to place anchor position
    vec4 eyePosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float distanceToCamera = length(eyePosition.xyz);

    // 2. Compute smooth alpha factor based on distance LOD thresholds
    vAlpha = clamp((maxDistance - distanceToCamera) / max(fadeDistance, 1.0), 0.0, 1.0);

    // 3. Project model-space anchor center (placed at ground) into homogeneous clip space
    vec4 clipCenter = projectionMatrix * eyePosition;

    // 4. Add pixel offset directly in NDC (normalized device coordinates).
    //    THREE.Sprite standard quad has position in [-0.5, 0.5].
    //    Anchored centered horizontally, and bottom slightly above ground (+0.5).
    vec2 alignedOffset = vec2(position.x, position.y + 0.5);
    vec2 ndcOffset = (alignedOffset * screenSize / viewport) * 2.0;
    clipCenter.xy += ndcOffset * clipCenter.w;

    gl_Position = clipCenter;
  }
`;

const placeSpriteFragmentShader = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.01) discard;

    vec4 texColor = texture2D(map, vUv);
    if (texColor.a < 0.05) discard;

    gl_FragColor = vec4(texColor.rgb, texColor.a * vAlpha);
  }
`;

function getPlaceName(tags: Record<string, string | undefined>): string {
  return (
    tags['name:zh'] ||
    tags['name:zh-Hans'] ||
    tags['name:zh_pinyin'] ||
    tags['name'] ||
    tags['name:en'] ||
    'Place'
  );
}

function getPlaceSubName(tags: Record<string, string | undefined>): string | null {
  const primary = getPlaceName(tags);
  const en = tags['name:en'];
  if (en && en !== primary) {
    return en;
  }
  const pinyin = tags['name:zh_pinyin'];
  if (pinyin && pinyin !== primary) {
    return pinyin;
  }
  return null;
}

function createPlaceSpriteTexture(
  primaryText: string,
  subText: string | null,
  placeType: string,
): { texture: THREE.CanvasTexture; aspect: number; screenHeight: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const rankInfo = PLACE_RANKS[placeType] || PLACE_RANKS.locality;

  // Measure text width dynamically to size canvas tightly
  const tempCtx = canvas.getContext('2d')!;
  tempCtx.font = `bold ${rankInfo.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif`;
  const primaryMetrics = tempCtx.measureText(primaryText);

  let subMetricsWidth = 0;
  if (subText) {
    tempCtx.font = `bold ${rankInfo.subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SUSEMono", monospace`;
    subMetricsWidth = tempCtx.measureText(subText).width;
  }

  const maxContentWidth = Math.max(primaryMetrics.width, subMetricsWidth);
  const paddingX = rankInfo.haloWidth + 12;
  const canvasWidth = Math.ceil(maxContentWidth + paddingX * 2);
  const canvasHeight = subText ? 140 : 100;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  if (ctx) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const centerX = canvasWidth / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    // Primary Name Y position
    const primaryY = subText ? 60 : canvasHeight / 2 + rankInfo.fontSize * 0.35;

    // 1. Draw dark outer protective halo/stroke behind text
    ctx.font = `bold ${rankInfo.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(10, 18, 26, 0.92)';
    ctx.lineWidth = rankInfo.haloWidth;
    ctx.strokeText(primaryText, centerX, primaryY);

    // 2. Draw crisp colored text fill on top
    ctx.fillStyle = rankInfo.color;
    ctx.fillText(primaryText, centerX, primaryY);

    // 3. Draw Subtitle (English / Pinyin) if present
    if (subText) {
      const subY = primaryY + rankInfo.fontSize * 0.45 + rankInfo.subFontSize * 0.55 + 6;
      ctx.font = `bold ${rankInfo.subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SUSEMono", monospace`;
      ctx.strokeStyle = 'rgba(10, 18, 26, 0.88)';
      ctx.lineWidth = Math.max(4, rankInfo.haloWidth - 2);
      ctx.strokeText(subText, centerX, subY);

      ctx.fillStyle = rankInfo.subColor;
      ctx.fillText(subText, centerX, subY);
    }

    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return {
    texture,
    aspect: canvasWidth / canvasHeight,
    screenHeight: rankInfo.screenHeight,
  };
}

function sampleElevationFromAtlas(demAtlas: DemAtlas, u: number, v: number): number {
  const clampedU = Math.min(1, Math.max(0, u));
  const clampedV = Math.min(1, Math.max(0, v));

  const x = Math.min(demAtlas.atlasWidth - 1, Math.floor(clampedU * demAtlas.atlasWidth));
  const y = Math.min(demAtlas.atlasHeight - 1, Math.floor(clampedV * demAtlas.atlasHeight));
  const index = y * demAtlas.atlasWidth + x;

  const rawElevation = demAtlas.atlasData[index];
  if (Number.isFinite(rawElevation) && rawElevation > -500 && rawElevation < 9000) {
    return rawElevation - demAtlas.demMedian;
  }
  return 0;
}

export function buildPlacesGroup(
  featureCollection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas: DemAtlas,
  elevationOffset = 0.5,
  viewportUniform?: { value: THREE.Vector2 },
  customLodConfig?: Partial<Record<string, PlaceLodConfig>>,
): PlacesGroup {
  const group = new THREE.Group() as PlacesGroup;
  group.name = 'places-group';

  // Shared viewport size uniform across all place sprites
  const sharedViewportUniform = viewportUniform ?? {
    value: new THREE.Vector2(
      typeof window !== 'undefined' ? window.innerWidth : 1024,
      typeof window !== 'undefined' ? window.innerHeight : 768,
    ),
  };

  group.updateViewport = (width: number, height: number) => {
    sharedViewportUniform.value.set(width, height);
  };

  const features = featureCollection.features || [];

  for (const feature of features) {
    if (!feature.geometry || feature.geometry.type !== 'Point') {
      continue;
    }

    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    const tags = (feature.properties?.tags || feature.properties || {}) as Record<
      string,
      string | undefined
    >;
    const placeType = tags.place || 'locality';
    const primaryName = getPlaceName(tags);
    const subName = getPlaceSubName(tags);

    // Calculate meter offset relative to worldCenterLatlng
    const { x, z } = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);

    // Sample terrain elevation from the DemAtlas DataTexture
    const demUv = demAtlas.getDemUv(lat, lng);
    const terrainHeight = sampleElevationFromAtlas(demAtlas, demUv.u, demUv.v);
    const groundY = terrainHeight;

    // Resolve LOD thresholds for this place category
    const lodSetting =
      customLodConfig?.[placeType] ??
      DEFAULT_PLACE_LOD_CONFIG[placeType] ??
      DEFAULT_PLACE_LOD_CONFIG.locality;

    // Constant Screen-Size Billboard Sprite with integrated tether and ground anchor
    const { texture, aspect, screenHeight } = createPlaceSpriteTexture(
      primaryName,
      subName,
      placeType,
    );
    const scaledScreenHeight = screenHeight * PLACE_LABEL_SCALE;
    const scaledScreenWidth = scaledScreenHeight * aspect;

    const spriteMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        screenSize: { value: new THREE.Vector2(scaledScreenWidth, scaledScreenHeight) },
        viewport: sharedViewportUniform,
        maxDistance: { value: lodSetting.maxDistance },
        fadeDistance: { value: lodSetting.fadeDistance },
      },
      vertexShader: placeSpriteVertexShader,
      fragmentShader: placeSpriteFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    // THREE.Sprite constructor expects SpriteMaterial in TypeScript definitions,
    // but at runtime Three.js WebGLRenderer accepts any Material (including ShaderMaterial) for sprites.
    const sprite = new THREE.Sprite(spriteMaterial as unknown as THREE.SpriteMaterial);
    sprite.position.set(x, groundY + elevationOffset, z);
    group.add(sprite);
  }

  return group;
}

export function disposePlacesGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat.dispose());
      } else {
        object.material?.dispose();
      }
    } else if (object instanceof THREE.Sprite) {
      object.geometry?.dispose();
      if (object.material.map) {
        object.material.map.dispose();
      }
      object.material.dispose();
    }
  });
  group.clear();
}
