import * as THREE from 'three';
import { DemAtlas } from './_demAtlas';

export interface LabelLodConfig {
  maxDistance: number;
  fadeDistance: number;
}

export interface LabelCategoryStyle {
  priority: number;
  color: string;
  subColor: string;
  fontSize: number;
  subFontSize: number;
  haloWidth: number;
  screenHeight: number;
}

export type LabelGroup = THREE.Group & {
  updateViewport: (width: number, height: number) => void;
};

export const DEFAULT_LABEL_SCALE = 1.6;

export const labelSpriteVertexShader = /* glsl */ `
  uniform vec2 screenSize;
  uniform vec2 viewport;
  uniform float maxDistance;
  uniform float fadeDistance;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    vUv = uv;

    // 1. Calculate eye-space distance from camera to anchor position
    vec4 eyePosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float distanceToCamera = length(eyePosition.xyz);

    // 2. Compute smooth alpha factor based on distance LOD thresholds
    vAlpha = clamp((maxDistance - distanceToCamera) / max(fadeDistance, 1.0), 0.0, 1.0);

    // 3. Project model-space anchor center into homogeneous clip space
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

export const labelSpriteFragmentShader = /* glsl */ `
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

export function createLabelSpriteTexture(
  primaryText: string,
  subText: string | null,
  style: LabelCategoryStyle,
): { texture: THREE.CanvasTexture; aspect: number; screenHeight: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Measure text width dynamically to size canvas tightly
  const tempCtx = canvas.getContext('2d')!;
  tempCtx.font = `bold ${style.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif`;
  const primaryMetrics = tempCtx.measureText(primaryText);

  let subMetricsWidth = 0;
  if (subText) {
    tempCtx.font = `bold ${style.subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SUSEMono", monospace`;
    subMetricsWidth = tempCtx.measureText(subText).width;
  }

  const maxContentWidth = Math.max(primaryMetrics.width, subMetricsWidth);
  const paddingX = style.haloWidth + 12;
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
    const primaryY = subText ? 60 : canvasHeight / 2 + style.fontSize * 0.35;

    // 1. Draw dark outer protective halo/stroke behind text
    ctx.font = `bold ${style.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(10, 18, 26, 0.92)';
    ctx.lineWidth = style.haloWidth;
    ctx.strokeText(primaryText, centerX, primaryY);

    // 2. Draw crisp colored text fill on top
    ctx.fillStyle = style.color;
    ctx.fillText(primaryText, centerX, primaryY);

    // 3. Draw Subtitle (ref / English / Pinyin) if present
    if (subText) {
      const subY = primaryY + style.fontSize * 0.45 + style.subFontSize * 0.55 + 6;
      ctx.font = `bold ${style.subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SUSEMono", monospace`;
      ctx.strokeStyle = 'rgba(10, 18, 26, 0.88)';
      ctx.lineWidth = Math.max(4, style.haloWidth - 2);
      ctx.strokeText(subText, centerX, subY);

      ctx.fillStyle = style.subColor;
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
    screenHeight: style.screenHeight,
  };
}

export function sampleElevationFromAtlas(demAtlas: DemAtlas, u: number, v: number): number {
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

export function createLabelSprite({
  texture,
  aspect,
  screenHeight,
  scale = DEFAULT_LABEL_SCALE,
  viewportUniform,
  lodConfig,
  position,
}: {
  texture: THREE.CanvasTexture;
  aspect: number;
  screenHeight: number;
  scale?: number;
  viewportUniform: { value: THREE.Vector2 };
  lodConfig: LabelLodConfig;
  position: THREE.Vector3;
}): THREE.Sprite {
  const scaledScreenHeight = screenHeight * scale;
  const scaledScreenWidth = scaledScreenHeight * aspect;

  const spriteMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      screenSize: { value: new THREE.Vector2(scaledScreenWidth, scaledScreenHeight) },
      viewport: viewportUniform,
      maxDistance: { value: lodConfig.maxDistance },
      fadeDistance: { value: lodConfig.fadeDistance },
    },
    vertexShader: labelSpriteVertexShader,
    fragmentShader: labelSpriteFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMaterial as unknown as THREE.SpriteMaterial);
  sprite.position.copy(position);
  return sprite;
}

export function createLabelGroup(
  name: string,
  viewportUniform?: { value: THREE.Vector2 },
): { group: LabelGroup; sharedViewportUniform: { value: THREE.Vector2 } } {
  const group = new THREE.Group() as LabelGroup;
  group.name = name;

  const sharedViewportUniform = viewportUniform ?? {
    value: new THREE.Vector2(
      typeof window !== 'undefined' ? window.innerWidth : 1024,
      typeof window !== 'undefined' ? window.innerHeight : 768,
    ),
  };

  group.updateViewport = (width: number, height: number) => {
    sharedViewportUniform.value.set(width, height);
  };

  return { group, sharedViewportUniform };
}

export function disposeLabelGroup(group: THREE.Group): void {
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
