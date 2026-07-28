# Shanshui Wash Terrain Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `shanshui-wash` terrain mode to the Lancangriver globe renderer, blending low-opacity satellite texture with wash-first tonal shading while maintaining interactive performance.

**Architecture:** Extend the existing tile material switching pipeline with one new material mode and shader pair. Keep data/LOD/streaming unchanged, and isolate style math in a dedicated config module with tested clamping and preset mapping. Add lightweight runtime quality guardrails and diagnostics hooks for frame-time-aware tuning.

**Tech Stack:** TypeScript, React, Three.js ShaderMaterial, GLSL, Vitest, lil-gui

---

## File Structure and Responsibilities

### Create

- `app/lancangriver/client/src/explore/materials/shanshuiWashConfig.ts`
  - Centralized defaults, presets, clamping, and degradation/recovery helpers.
- `app/lancangriver/client/src/explore/materials/shaders/tilewash.vert.glsl`
  - Vertex shader for shanshui wash mode (base terrain varying passthrough).
- `app/lancangriver/client/src/explore/materials/shaders/tilewash.frag.glsl`
  - Fragment shader implementing tonal bands, edge emphasis, haze, and low-opacity satellite blend.
- `app/lancangriver/client/src/explore/materials/TileShanshuiWashMaterial.class.ts`
  - Material class extending existing tile material pattern with wash uniforms.
- `app/lancangriver/client/src/explore/materials/shanshuiWashConfig.test.ts`
  - Unit tests for preset mapping, clamping, and quality degradation/recovery behavior.

### Modify

- `app/lancangriver/client/src/explore/SphereTile.class.ts`
  - Add `shanshui-wash` mode enum and material creation path.
- `app/lancangriver/client/src/explore/setup/gui.ts`
  - Add mode selector entry and controls for wash parameters/preset.
- `app/lancangriver/client/src/explore/setup/index.ts`
  - Wire quality state and update wash material uniforms during interaction.
- `app/lancangriver/client/src/explore/Sphere.class.ts`
  - Add frame-time p95 reporting for diagnostics.
- `app/lancangriver/client/src/explore/dom/SceneMonitor.tsx`
  - Display frame-time p95 and active wash preset when available.

### Optional Follow-up (same PR if low risk)

- `app/lancangriver/client/src/explore/materials/TileShanshuiWashMaterial.test.ts`
  - Constructor-level smoke test (uniform shape only) if test environment supports it.

---

### Task 1: Add Shanshui Config + Unit Tests (TDD)

**Files:**

- Create: `app/lancangriver/client/src/explore/materials/shanshuiWashConfig.test.ts`
- Create: `app/lancangriver/client/src/explore/materials/shanshuiWashConfig.ts`

- [ ] **Step 1: Write the failing unit tests first**

```ts
import { describe, expect, it } from "vitest";
import {
  clampWashParams,
  defaultWashParams,
  degradeWashParams,
  getWashPreset,
  recoverWashParams,
} from "./shanshuiWashConfig";

describe("shanshuiWashConfig", () => {
  it("returns balanced preset as default", () => {
    expect(defaultWashParams.preset).toBe("balanced");
    expect(defaultWashParams.satelliteBlendOpacity).toBeLessThanOrEqual(0.35);
  });

  it("clamps unsafe values into valid ranges", () => {
    const clamped = clampWashParams({
      toneBands: 99,
      satelliteBlendOpacity: 1,
      hazeStrength: 999,
      edgeStrength: -4,
      washContrast: -1,
      preset: "balanced",
    });

    expect(clamped.toneBands).toBeLessThanOrEqual(8);
    expect(clamped.satelliteBlendOpacity).toBeLessThanOrEqual(0.35);
    expect(clamped.edgeStrength).toBeGreaterThanOrEqual(0);
  });

  it("degrades and recovers quality without leaving bounds", () => {
    const high = getWashPreset("high");
    const degraded = degradeWashParams(high);
    const recovered = recoverWashParams(degraded, "high");

    expect(degraded.toneBands).toBeLessThanOrEqual(high.toneBands);
    expect(recovered.toneBands).toBeLessThanOrEqual(8);
    expect(recovered.satelliteBlendOpacity).toBeLessThanOrEqual(0.35);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
cd app/lancangriver/client
npm test -- src/explore/materials/shanshuiWashConfig.test.ts
```

Expected: FAIL with module-not-found for `./shanshuiWashConfig`.

- [ ] **Step 3: Implement the config module minimally to satisfy tests**

```ts
export type WashPresetName = "high" | "balanced" | "low";

export type ShanshuiWashParams = {
  preset: WashPresetName;
  toneBands: number;
  edgeStrength: number;
  washContrast: number;
  hazeStrength: number;
  satelliteBlendOpacity: number;
};

const PRESETS: Record<WashPresetName, ShanshuiWashParams> = {
  high: {
    preset: "high",
    toneBands: 7,
    edgeStrength: 0.9,
    washContrast: 1.15,
    hazeStrength: 0.7,
    satelliteBlendOpacity: 0.2,
  },
  balanced: {
    preset: "balanced",
    toneBands: 5,
    edgeStrength: 0.6,
    washContrast: 1.0,
    hazeStrength: 0.55,
    satelliteBlendOpacity: 0.16,
  },
  low: {
    preset: "low",
    toneBands: 3,
    edgeStrength: 0.35,
    washContrast: 0.9,
    hazeStrength: 0.4,
    satelliteBlendOpacity: 0.12,
  },
};

export const defaultWashParams = { ...PRESETS.balanced };

export function getWashPreset(name: WashPresetName): ShanshuiWashParams {
  return { ...PRESETS[name] };
}

export function clampWashParams(input: ShanshuiWashParams): ShanshuiWashParams {
  return {
    ...input,
    toneBands: Math.min(8, Math.max(2, Math.round(input.toneBands))),
    edgeStrength: Math.min(1.5, Math.max(0, input.edgeStrength)),
    washContrast: Math.min(2, Math.max(0.5, input.washContrast)),
    hazeStrength: Math.min(1.2, Math.max(0, input.hazeStrength)),
    satelliteBlendOpacity: Math.min(
      0.35,
      Math.max(0, input.satelliteBlendOpacity),
    ),
  };
}

export function degradeWashParams(
  params: ShanshuiWashParams,
): ShanshuiWashParams {
  return clampWashParams({
    ...params,
    toneBands: params.toneBands - 1,
    edgeStrength: params.edgeStrength * 0.9,
    hazeStrength: params.hazeStrength * 0.9,
  });
}

export function recoverWashParams(
  params: ShanshuiWashParams,
  targetPreset: WashPresetName,
): ShanshuiWashParams {
  const target = getWashPreset(targetPreset);
  return clampWashParams({
    ...params,
    toneBands: Math.min(target.toneBands, params.toneBands + 1),
    edgeStrength: Math.min(target.edgeStrength, params.edgeStrength + 0.05),
    hazeStrength: Math.min(target.hazeStrength, params.hazeStrength + 0.05),
  });
}
```

- [ ] **Step 4: Re-run tests and verify pass**

Run:

```bash
cd app/lancangriver/client
npm test -- src/explore/materials/shanshuiWashConfig.test.ts
```

Expected: PASS for all `shanshuiWashConfig` tests.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/explore/materials/shanshuiWashConfig.ts app/lancangriver/client/src/explore/materials/shanshuiWashConfig.test.ts
```

```bash
git commit -m "feat(client): add shanshui wash config presets and clamps"
```

---

### Task 2: Add Wash Shader + Material Class

**Files:**

- Create: `app/lancangriver/client/src/explore/materials/shaders/tilewash.vert.glsl`
- Create: `app/lancangriver/client/src/explore/materials/shaders/tilewash.frag.glsl`
- Create: `app/lancangriver/client/src/explore/materials/TileShanshuiWashMaterial.class.ts`

- [ ] **Step 1: Create minimal vertex shader (failing render expectation not compile tested)**

```glsl
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPositionW;

void main() {
  vUv = uv;
  vNormalW = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vPositionW = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
```

- [ ] **Step 2: Create fragment shader implementing wash composition**

```glsl
uniform vec3 uColor;
uniform sampler2D uSatelliteTexture;
uniform float uTextureReady;
uniform float uToneBands;
uniform float uInkEdgeStrength;
uniform float uWashContrast;
uniform float uHazeStrength;
uniform float uSatelliteBlendOpacity;
uniform float uCameraDistanceMeters;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPositionW;

float quantizeBands(float value, float bands) {
  float b = max(2.0, bands);
  return floor(value * b) / b;
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 lightDir = normalize(vec3(0.35, 0.8, 0.2));
  float lambert = max(dot(n, lightDir), 0.0);

  float washBase = quantizeBands(pow(lambert, 1.0 / max(0.5, uWashContrast)), uToneBands);
  float edge = pow(1.0 - abs(dot(n, vec3(0.0, 1.0, 0.0))), 2.0) * uInkEdgeStrength;

  vec3 washColor = mix(vec3(0.88, 0.90, 0.86), vec3(0.33, 0.39, 0.44), washBase);
  washColor = mix(washColor, vec3(0.12, 0.16, 0.20), edge * 0.5);

  vec3 satColor = texture2D(uSatelliteTexture, vUv).rgb;
  float satMix = (uTextureReady > 0.5) ? uSatelliteBlendOpacity : 0.0;

  vec3 color = mix(washColor, satColor, satMix);

  float hazeT = clamp(uCameraDistanceMeters / 250000.0, 0.0, 1.0) * uHazeStrength;
  color = mix(color, vec3(0.78, 0.83, 0.86), hazeT);

  gl_FragColor = vec4(color, 1.0);
}
```

- [ ] **Step 3: Create material class based on TileBasicMaterial pattern**

```ts
import * as THREE from "three";
import { SphereTileKey } from "../../calc/types";
import { TileBasicMaterial } from "./TileBasicMaterial.class";
import vertexShader from "./shaders/tilewash.vert.glsl?raw";
import fragmentShader from "./shaders/tilewash.frag.glsl?raw";
import { ShanshuiWashParams, clampWashParams } from "./shanshuiWashConfig";

type Parameters = {
  tileKey: SphereTileKey;
  washParams: ShanshuiWashParams;
};

export class TileShanshuiWashMaterial extends TileBasicMaterial {
  constructor(textureLoader: THREE.TextureLoader, parameters: Parameters) {
    super(textureLoader, { tileKey: parameters.tileKey });
    const safe = clampWashParams(parameters.washParams);

    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.uniforms.uToneBands = { value: safe.toneBands };
    this.uniforms.uInkEdgeStrength = { value: safe.edgeStrength };
    this.uniforms.uWashContrast = { value: safe.washContrast };
    this.uniforms.uHazeStrength = { value: safe.hazeStrength };
    this.uniforms.uSatelliteBlendOpacity = {
      value: safe.satelliteBlendOpacity,
    };
    this.uniforms.uCameraDistanceMeters = { value: 1_000.0 };
    this.needsUpdate = true;
  }

  setCameraDistanceMeters(distance: number): void {
    this.uniforms.uCameraDistanceMeters.value = Math.max(0, distance);
  }

  setWashParams(next: ShanshuiWashParams): void {
    const safe = clampWashParams(next);
    this.uniforms.uToneBands.value = safe.toneBands;
    this.uniforms.uInkEdgeStrength.value = safe.edgeStrength;
    this.uniforms.uWashContrast.value = safe.washContrast;
    this.uniforms.uHazeStrength.value = safe.hazeStrength;
    this.uniforms.uSatelliteBlendOpacity.value = safe.satelliteBlendOpacity;
  }
}
```

- [ ] **Step 4: Build-check for shader imports and TS types**

Run:

```bash
cd app/lancangriver/client
npm run build
```

Expected: build completes successfully.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/explore/materials/shaders/tilewash.vert.glsl app/lancangriver/client/src/explore/materials/shaders/tilewash.frag.glsl app/lancangriver/client/src/explore/materials/TileShanshuiWashMaterial.class.ts
```

```bash
git commit -m "feat(client): add shanshui wash terrain shader material"
```

---

### Task 3: Integrate New Mode in SphereTile Material Switching

**Files:**

- Modify: `app/lancangriver/client/src/explore/SphereTile.class.ts`

- [ ] **Step 1: Add failing test for mode enum and material path (optional if test harness available)**

```ts
import { describe, expect, it } from "vitest";
import { TileMaterialMode } from "./SphereTile.class";

describe("TileMaterialMode", () => {
  it("includes shanshui wash mode", () => {
    expect(TileMaterialMode.ShanshuiWash).toBe("shanshui-wash");
  });
});
```

- [ ] **Step 2: Add enum value and mode switch branch**

```ts
export enum TileMaterialMode {
  Basic = "basic",
  Dem = "dem",
  Clean = "clean",
  DemAdvance = "dem-advance",
  Debug = "debug",
  ShanshuiWash = "shanshui-wash",
}
```

Add branch in `createMaterialForMode`:

```ts
case TileMaterialMode.ShanshuiWash:
  return new TileShanshuiWashMaterial(this.textureLoader, {
    tileKey: this.tile,
    washParams: getWashPreset("balanced"),
  });
```

Add branch in `isCurrentMaterialForMode`:

```ts
case TileMaterialMode.ShanshuiWash:
  return this.material instanceof TileShanshuiWashMaterial;
```

- [ ] **Step 3: Run targeted tests (if added) and full suite**

Run:

```bash
cd app/lancangriver/client
npm test
```

Expected: PASS, including new mode coverage.

- [ ] **Step 4: Commit**

```bash
git add app/lancangriver/client/src/explore/SphereTile.class.ts
```

```bash
git commit -m "feat(client): register shanshui wash terrain mode in SphereTile"
```

---

### Task 4: Wire GUI Controls and Runtime Wash Params

**Files:**

- Modify: `app/lancangriver/client/src/explore/setup/gui.ts`
- Modify: `app/lancangriver/client/src/explore/setup/index.ts`

- [ ] **Step 1: Add GUI controls for preset and wash params (failing state expectation first)**

```ts
const washState = {
  preset: "balanced" as const,
  toneBands: 5,
  edgeStrength: 0.6,
  washContrast: 1.0,
  hazeStrength: 0.55,
  satelliteBlendOpacity: 0.16,
};
```

In terrain mode options list, include `TileMaterialMode.ShanshuiWash`.

- [ ] **Step 2: Implement runtime callback wiring in setup to apply wash params on attached tiles**

```ts
const applyWashToAttachedTiles = (params: ShanshuiWashParams) => {
  for (const node of tileManager.getAttachedNodes()) {
    const material = node.tile?.material;
    if (material instanceof TileShanshuiWashMaterial) {
      material.setWashParams(params);
      material.setCameraDistanceMeters(camera.position.length() - EARTH_RADIUS);
    }
  }
};
```

- [ ] **Step 3: Hook controls to update tiles and refresh render stats**

```ts
terrainFolder
  .add(washState, "toneBands", 2, 8, 1)
  .name("wash tone bands")
  .onChange(() => {
    applyWashToAttachedTiles(clampWashParams(washState));
    onRefreshVisibleTilesAndStats();
  });
```

- [ ] **Step 4: Verify behavior manually in dev server**

Run:

```bash
cd app/lancangriver/client
npm run dev
```

Expected:

- `shanshui-wash` appears in terrain mode list.
- Parameter sliders visibly affect wash rendering.
- Satellite detail remains subtle under wash tone.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/explore/setup/gui.ts app/lancangriver/client/src/explore/setup/index.ts
```

```bash
git commit -m "feat(client): add shanshui wash GUI controls and runtime updates"
```

---

### Task 5: Add Performance Guardrails and Diagnostics

**Files:**

- Modify: `app/lancangriver/client/src/explore/Sphere.class.ts`
- Modify: `app/lancangriver/client/src/explore/dom/SceneMonitor.tsx`
- Modify: `app/lancangriver/client/src/explore/setup/index.ts`

- [ ] **Step 1: Extend stats payload with frame-time p95 and active wash preset**

```ts
export type SphereStatsPayload = {
  cameraDistanceMeters: number;
  zoomLevel: number;
  visibleTilesCount: number;
  controlMode: ControlMode;
  loadingLoaded: number;
  loadingTotal: number;
  loadingActive: boolean;
  loadingErrors: number;
  loadingLastErrorUrl: string | null;
  frameTimeP95Ms: number;
  washPreset: string | null;
};
```

- [ ] **Step 2: Implement rolling frame-time window and p95 calculation**

```ts
const frameTimes: number[] = [];
function pushFrameTime(ms: number) {
  frameTimes.push(ms);
  if (frameTimes.length > 120) frameTimes.shift();
}
function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
}
```

- [ ] **Step 3: Add degradation/recovery trigger in setup based on frame-time threshold**

```ts
if (stats.frameTimeP95Ms > 22) {
  currentWashParams = degradeWashParams(currentWashParams);
} else if (stats.frameTimeP95Ms < 18) {
  currentWashParams = recoverWashParams(
    currentWashParams,
    currentWashParams.preset,
  );
}
applyWashToAttachedTiles(currentWashParams);
```

- [ ] **Step 4: Render new diagnostics in SceneMonitor**

```tsx
<div>
  <div className="opacity-[0.68]">Frame p95</div>
  <div>{stats ? `${stats.frameTimeP95Ms.toFixed(1)} ms` : "--"}</div>
</div>
<div>
  <div className="opacity-[0.68]">Wash preset</div>
  <div>{stats?.washPreset ?? "--"}</div>
</div>
```

- [ ] **Step 5: Validate with tests + manual run**

Run:

```bash
cd app/lancangriver/client
npm test
npm run dev
```

Expected:

- Tests pass.
- Monitor shows frame p95 and wash preset.
- Quality reduces under sustained heavy frame-time and recovers later.

- [ ] **Step 6: Commit**

```bash
git add app/lancangriver/client/src/explore/Sphere.class.ts app/lancangriver/client/src/explore/dom/SceneMonitor.tsx app/lancangriver/client/src/explore/setup/index.ts
```

```bash
git commit -m "feat(client): add wash performance guardrails and diagnostics"
```

---

### Task 6: Final Verification and Documentation Update

**Files:**

- Modify: `app/lancangriver/client/RENDER_LOGIC.md`
- Modify: `app/lancangriver/client/README.md`

- [ ] **Step 1: Document new terrain mode and tuning controls**

```md
### Shanshui Wash Terrain Mode

- Mode key: `shanshui-wash`
- Visual direction: wash-first with low-opacity satellite blend
- Default preset: `balanced`
- Performance guardrail: adaptive quality based on frame-time p95
```

- [ ] **Step 2: Run full client checks**

Run:

```bash
cd app/lancangriver/client
npm test
npm run build
```

Expected:

- All tests pass.
- Production build succeeds without TypeScript or shader import errors.

- [ ] **Step 3: Commit**

```bash
git add app/lancangriver/client/README.md app/lancangriver/client/RENDER_LOGIC.md
```

```bash
git commit -m "docs(client): document shanshui wash mode behavior and tuning"
```

---

## Spec Coverage Check

- Add optional shanshui mode: covered by Tasks 2 and 3.
- Preserve existing tile data and LOD: covered by Tasks 3 and 4 (material-only integration).
- Wash-first style with low-opacity satellite blend: covered by Task 2 shader composition and Task 4 controls.
- Error handling/fallback and bounds: covered by Task 1 clamping and Task 2 material behavior.
- Performance guardrails and metrics: covered by Task 5.
- Testing strategy: covered by Tasks 1, 3, 5, and 6 verification.

No uncovered spec requirements remain.

## Placeholder Scan

- No `TODO`/`TBD` placeholders present.
- All tasks include concrete file paths, code snippets, commands, and expected outcomes.

## Type Consistency Check

- Mode key remains `shanshui-wash` across enum, GUI, and docs.
- Param type naming uses `ShanshuiWashParams` consistently.
- Preset naming uses `high | balanced | low` consistently.
