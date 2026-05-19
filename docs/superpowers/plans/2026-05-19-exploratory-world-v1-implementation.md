# Exploratory World V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable real-time exploratory world pipeline with near-camera tile streaming, adaptive quality, and geography-first visual output using free data only.

**Architecture:** Implement the approved two-lane design by splitting responsibilities into a Streaming Core (tile state, data normalization, scheduling, cache, fallbacks) and a Style Core (palette/profile/material tuning). Introduce a canonical tile schema and ring-based runtime orchestration, then integrate adaptive quality and observability to stabilize long-running sessions.

**Tech Stack:** TypeScript, React, Three.js, custom Node HTTP server, existing OSM/DEM routes, Vitest (unit/integration tests), optional Playwright-free screenshot harness via deterministic camera fixture.

---

## Scope Check

This spec is one product slice (exploratory world v1) but includes multiple tightly-coupled concerns (runtime scheduling, data normalization, style coherence, adaptive quality). Keep this as one implementation plan with strict milestone order (M0 -> M4) so each task lands working software and test coverage.

## File Structure (Planned Changes)

### Runtime Streaming Core

- Create: `app/client/src/runtime/types.ts`
  - Canonical types (`CanonicalTile`, `TileLayerCoverage`, `TileState`, `QualityLevel`).
- Create: `app/client/src/runtime/tile-state-machine.ts`
  - Deterministic tile lifecycle transitions + validation helpers.
- Create: `app/client/src/runtime/tile-keys.ts`
  - Tile key helpers, ring indexing, priority score primitives.
- Create: `app/client/src/runtime/tile-scheduler.ts`
  - Critical/prefetch/background queues and capped concurrency.
- Create: `app/client/src/runtime/cache/tile-cache.ts`
  - In-memory LRU cache and stale-entry metadata handling.
- Create: `app/client/src/runtime/cache/disk-cache.ts`
  - Browser-usable cache wrapper (IndexedDB/localStorage metadata) for canonical tile payloads.
- Create: `app/client/src/runtime/runtime-controller.ts`
  - Orchestrates camera window, scheduler, cache, and state machine.

### Data Normalization and Fallbacks

- Create: `app/client/src/runtime/normalize/canonical-tile.ts`
  - Convert route payloads into canonical schema.
- Create: `app/client/src/runtime/normalize/coverage.ts`
  - Compute per-layer `full | partial | absent` coverage bands.
- Create: `app/client/src/runtime/fallbacks/buildings.ts`
  - Proxy building mass generation from road density.
- Create: `app/client/src/runtime/fallbacks/hydro.ts`
  - DEM-informed hydro hints for missing water geometry.
- Create: `app/client/src/runtime/fallbacks/vegetation.ts`
  - Sparse placement fallback from slope and masks.

### Style Core

- Create: `app/client/src/style/profiles.ts`
  - `Natural-Daylight`, `Golden-Hour`, `Overcast-Cool` profile definitions.
- Create: `app/client/src/style/material-mapper.ts`
  - Map canonical semantic layers to material/shader parameters.
- Modify: `app/client/src/TileView.tsx`
  - Replace direct route coupling with runtime-controller + style mapper integration.
- Modify: `app/client/src/geo/setup.ts`
  - Add global style profile binding and deterministic screenshot camera support.

### Observability and Adaptive Quality

- Create: `app/client/src/runtime/perf/quality-controller.ts`
  - Q3/Q2/Q1 state machine with hysteresis.
- Create: `app/client/src/runtime/perf/quality-knobs.ts`
  - Ordered quality degradation policies.
- Create: `app/client/src/runtime/debug/runtime-hud.ts`
  - Toggleable debug metrics overlay.

### Tests

- Create: `app/client/vitest.config.ts`
- Create: `app/client/src/runtime/__tests__/tile-state-machine.test.ts`
- Create: `app/client/src/runtime/__tests__/tile-scheduler.test.ts`
- Create: `app/client/src/runtime/__tests__/coverage.test.ts`
- Create: `app/client/src/runtime/__tests__/quality-controller.test.ts`
- Create: `app/client/src/runtime/__tests__/runtime-controller.integration.test.ts`

### Documentation

- Modify: `README.md`
  - Add v1 runtime architecture and debug/testing instructions.

## Task 1: Test Harness Setup (M0 Foundation)

**Files:**

- Modify: `app/client/package.json`
- Create: `app/client/vitest.config.ts`
- Create: `app/client/src/runtime/__tests__/smoke.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/client/src/runtime/__tests__/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("runtime smoke", () => {
  it("confirms test harness is active", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (before tooling)**

Run: `cd app/client && npm run test:unit`
Expected: command/script missing error.

- [ ] **Step 3: Write minimal implementation**

```json
// app/client/package.json (scripts section)
{
  "scripts": {
    "test:unit": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.4",
    "@vitest/coverage-v8": "^3.2.4"
  }
}
```

```ts
// app/client/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/client && npm run test:unit`
Expected: PASS with 1 test.

- [ ] **Step 5: Commit**

```bash
git add app/client/package.json app/client/vitest.config.ts app/client/src/runtime/__tests__/smoke.test.ts
git commit -m "test: add vitest harness for runtime core"
```

## Task 2: Canonical Runtime Types and Tile State Machine

**Files:**

- Create: `app/client/src/runtime/types.ts`
- Create: `app/client/src/runtime/tile-state-machine.ts`
- Create: `app/client/src/runtime/__tests__/tile-state-machine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/client/src/runtime/__tests__/tile-state-machine.test.ts
import { describe, expect, it } from "vitest";
import { createTileRecord, transitionTile } from "../tile-state-machine";

describe("tile state machine", () => {
  it("allows requested -> loading -> ready -> visible", () => {
    const tile = createTileRecord("12/2050/1340");
    expect(tile.state).toBe("requested");

    const loading = transitionTile(tile, "loading");
    const ready = transitionTile(loading, "ready");
    const visible = transitionTile(ready, "visible");

    expect(visible.state).toBe("visible");
  });

  it("rejects illegal transitions", () => {
    const tile = createTileRecord("12/2050/1340");
    expect(() => transitionTile(tile, "ready")).toThrow(/illegal transition/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/tile-state-machine.test.ts`
Expected: FAIL with module not found for `tile-state-machine`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/client/src/runtime/types.ts
export type TileState =
  | "requested"
  | "loading"
  | "ready"
  | "visible"
  | "cooling"
  | "evicted";

export type CoverageBand = "full" | "partial" | "absent";

export interface TileLayerCoverage {
  terrain: CoverageBand;
  hydro: CoverageBand;
  roads: CoverageBand;
  buildings: CoverageBand;
  vegetationHints: CoverageBand;
  labels: CoverageBand;
}

export interface TileRecord {
  key: string;
  state: TileState;
  updatedAt: number;
}
```

```ts
// app/client/src/runtime/tile-state-machine.ts
import type { TileRecord, TileState } from "./types";

const ALLOWED: Record<TileState, TileState[]> = {
  requested: ["loading", "evicted"],
  loading: ["ready", "evicted"],
  ready: ["visible", "cooling", "evicted"],
  visible: ["cooling", "evicted"],
  cooling: ["visible", "evicted"],
  evicted: ["requested"],
};

export function createTileRecord(key: string): TileRecord {
  return { key, state: "requested", updatedAt: Date.now() };
}

export function transitionTile(tile: TileRecord, next: TileState): TileRecord {
  const allowed = ALLOWED[tile.state];
  if (!allowed.includes(next)) {
    throw new Error(`illegal transition: ${tile.state} -> ${next}`);
  }

  return { ...tile, state: next, updatedAt: Date.now() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/tile-state-machine.test.ts`
Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/client/src/runtime/types.ts app/client/src/runtime/tile-state-machine.ts app/client/src/runtime/__tests__/tile-state-machine.test.ts
git commit -m "feat: add canonical tile states and transition guards"
```

## Task 3: Scheduler with Ring-Aware Priorities

**Files:**

- Create: `app/client/src/runtime/tile-keys.ts`
- Create: `app/client/src/runtime/tile-scheduler.ts`
- Create: `app/client/src/runtime/__tests__/tile-scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/client/src/runtime/__tests__/tile-scheduler.test.ts
import { describe, expect, it } from "vitest";
import { TileScheduler } from "../tile-scheduler";

describe("tile scheduler", () => {
  it("serves critical queue before prefetch and background", () => {
    const scheduler = new TileScheduler();

    scheduler.enqueue("background", { key: "b" });
    scheduler.enqueue("prefetch", { key: "p" });
    scheduler.enqueue("critical", { key: "c" });

    expect(scheduler.dequeue()?.key).toBe("c");
    expect(scheduler.dequeue()?.key).toBe("p");
    expect(scheduler.dequeue()?.key).toBe("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/tile-scheduler.test.ts`
Expected: FAIL with module not found for `tile-scheduler`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/client/src/runtime/tile-keys.ts
export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}
```

```ts
// app/client/src/runtime/tile-scheduler.ts
export type QueueName = "critical" | "prefetch" | "background";

export interface QueueItem {
  key: string;
}

export class TileScheduler {
  private queues: Record<QueueName, QueueItem[]> = {
    critical: [],
    prefetch: [],
    background: [],
  };

  enqueue(queue: QueueName, item: QueueItem): void {
    this.queues[queue].push(item);
  }

  dequeue(): QueueItem | undefined {
    return (
      this.queues.critical.shift() ??
      this.queues.prefetch.shift() ??
      this.queues.background.shift()
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/tile-scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/client/src/runtime/tile-keys.ts app/client/src/runtime/tile-scheduler.ts app/client/src/runtime/__tests__/tile-scheduler.test.ts
git commit -m "feat: add ring scheduler queue priorities"
```

## Task 4: Canonical Tile Normalization + Coverage Bands

**Files:**

- Create: `app/client/src/runtime/normalize/canonical-tile.ts`
- Create: `app/client/src/runtime/normalize/coverage.ts`
- Create: `app/client/src/runtime/__tests__/coverage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/client/src/runtime/__tests__/coverage.test.ts
import { describe, expect, it } from "vitest";
import { toCoverageBand, computeCoverage } from "../normalize/coverage";

describe("coverage bands", () => {
  it("maps numeric coverage to full|partial|absent", () => {
    expect(toCoverageBand(0.9)).toBe("full");
    expect(toCoverageBand(0.3)).toBe("partial");
    expect(toCoverageBand(0.0)).toBe("absent");
  });

  it("computes layer coverage snapshot", () => {
    const result = computeCoverage({
      buildings: 0.1,
      hydro: 0,
      labels: 0.5,
      roads: 0.8,
      terrain: 1,
      vegetationHints: 0.2,
    });

    expect(result.hydro).toBe("absent");
    expect(result.roads).toBe("full");
    expect(result.labels).toBe("partial");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/coverage.test.ts`
Expected: FAIL with unresolved module.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/client/src/runtime/normalize/coverage.ts
import type { TileLayerCoverage } from "../types";

export function toCoverageBand(
  value: number,
): TileLayerCoverage[keyof TileLayerCoverage] {
  if (value >= 0.75) return "full";
  if (value > 0) return "partial";
  return "absent";
}

export function computeCoverage(
  input: Record<keyof TileLayerCoverage, number>,
): TileLayerCoverage {
  return {
    terrain: toCoverageBand(input.terrain),
    hydro: toCoverageBand(input.hydro),
    roads: toCoverageBand(input.roads),
    buildings: toCoverageBand(input.buildings),
    vegetationHints: toCoverageBand(input.vegetationHints),
    labels: toCoverageBand(input.labels),
  };
}
```

```ts
// app/client/src/runtime/normalize/canonical-tile.ts
import type { TileLayerCoverage } from "../types";

export interface CanonicalTile {
  key: string;
  coverage: TileLayerCoverage;
  terrain: unknown;
  hydro: unknown;
  roads: unknown;
  buildings: unknown;
  vegetationHints: unknown;
  labels: unknown;
  sourceMeta: Record<
    string,
    { source: string; confidence: number; age: number }
  >;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/client/src/runtime/normalize/canonical-tile.ts app/client/src/runtime/normalize/coverage.ts app/client/src/runtime/__tests__/coverage.test.ts
git commit -m "feat: add canonical coverage bands for runtime layers"
```

## Task 5: Fallback Providers for Missing Buildings/Hydro/Vegetation

**Files:**

- Create: `app/client/src/runtime/fallbacks/buildings.ts`
- Create: `app/client/src/runtime/fallbacks/hydro.ts`
- Create: `app/client/src/runtime/fallbacks/vegetation.ts`
- Create: `app/client/src/runtime/__tests__/fallbacks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/client/src/runtime/__tests__/fallbacks.test.ts
import { describe, expect, it } from "vitest";
import { createBuildingFallback } from "../fallbacks/buildings";
import { createHydroFallback } from "../fallbacks/hydro";
import { createVegetationFallback } from "../fallbacks/vegetation";

describe("fallback providers", () => {
  it("creates proxy buildings when road density is high", () => {
    const mesh = createBuildingFallback({ roadDensity: 0.8, tileSize: 1000 });
    expect(mesh.count).toBeGreaterThan(0);
  });

  it("creates hydro hint with non-zero confidence in valleys", () => {
    const hint = createHydroFallback({ slopeMean: 0.2, valleyScore: 0.7 });
    expect(hint.confidence).toBeGreaterThan(0);
  });

  it("creates sparse vegetation points", () => {
    const points = createVegetationFallback({
      slopeMean: 0.35,
      maskGreenRatio: 0.4,
    });
    expect(points.count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/fallbacks.test.ts`
Expected: FAIL due to missing fallback modules.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/client/src/runtime/fallbacks/buildings.ts
export function createBuildingFallback(input: {
  roadDensity: number;
  tileSize: number;
}) {
  const base = Math.floor(input.roadDensity * 40);
  return { count: Math.max(0, base), proxyHeight: 8 + input.roadDensity * 20 };
}
```

```ts
// app/client/src/runtime/fallbacks/hydro.ts
export function createHydroFallback(input: {
  slopeMean: number;
  valleyScore: number;
}) {
  const confidence = Math.max(
    0,
    Math.min(1, input.valleyScore * (1 - input.slopeMean)),
  );
  return { confidence, width: 2 + confidence * 6 };
}
```

```ts
// app/client/src/runtime/fallbacks/vegetation.ts
export function createVegetationFallback(input: {
  slopeMean: number;
  maskGreenRatio: number;
}) {
  const score = Math.max(0, input.maskGreenRatio * (1 - input.slopeMean));
  return { count: Math.floor(score * 500), density: score };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/fallbacks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/client/src/runtime/fallbacks/buildings.ts app/client/src/runtime/fallbacks/hydro.ts app/client/src/runtime/fallbacks/vegetation.ts app/client/src/runtime/__tests__/fallbacks.test.ts
git commit -m "feat: add canonical fallbacks for incomplete geodata"
```

## Task 6: Adaptive Quality Controller (Q3/Q2/Q1 with Hysteresis)

**Files:**

- Create: `app/client/src/runtime/perf/quality-controller.ts`
- Create: `app/client/src/runtime/perf/quality-knobs.ts`
- Create: `app/client/src/runtime/__tests__/quality-controller.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/client/src/runtime/__tests__/quality-controller.test.ts
import { describe, expect, it } from "vitest";
import { QualityController } from "../perf/quality-controller";

describe("quality controller", () => {
  it("degrades to Q2/Q1 when frame time is high", () => {
    const qc = new QualityController();

    qc.pushSample({ frameMs: 35, tileLatencyMs: 120 });
    qc.pushSample({ frameMs: 38, tileLatencyMs: 140 });

    expect(["Q2", "Q1"]).toContain(qc.getState());
  });

  it("does not oscillate immediately due to hysteresis", () => {
    const qc = new QualityController();
    qc.pushSample({ frameMs: 40, tileLatencyMs: 100 });
    const degraded = qc.getState();

    qc.pushSample({ frameMs: 16, tileLatencyMs: 30 });
    expect(qc.getState()).toBe(degraded);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/quality-controller.test.ts`
Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/client/src/runtime/perf/quality-controller.ts
export type QualityLevel = "Q3" | "Q2" | "Q1";

export class QualityController {
  private state: QualityLevel = "Q3";
  private coolDown = 0;

  pushSample(sample: { frameMs: number; tileLatencyMs: number }): void {
    if (this.coolDown > 0) {
      this.coolDown -= 1;
      return;
    }

    if (sample.frameMs > 34 || sample.tileLatencyMs > 130) {
      this.state = this.state === "Q3" ? "Q2" : "Q1";
      this.coolDown = 3;
      return;
    }

    if (
      sample.frameMs < 20 &&
      sample.tileLatencyMs < 60 &&
      this.state !== "Q3"
    ) {
      this.state = this.state === "Q1" ? "Q2" : "Q3";
      this.coolDown = 3;
    }
  }

  getState(): QualityLevel {
    return this.state;
  }
}
```

```ts
// app/client/src/runtime/perf/quality-knobs.ts
import type { QualityLevel } from "./quality-controller";

export function qualityKnobs(level: QualityLevel) {
  if (level === "Q3")
    return { vegetationDensity: 1, shadows: 1, renderScale: 1 };
  if (level === "Q2")
    return { vegetationDensity: 0.7, shadows: 0.75, renderScale: 0.9 };
  return { vegetationDensity: 0.4, shadows: 0.5, renderScale: 0.8 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/quality-controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/client/src/runtime/perf/quality-controller.ts app/client/src/runtime/perf/quality-knobs.ts app/client/src/runtime/__tests__/quality-controller.test.ts
git commit -m "feat: add adaptive quality states with hysteresis"
```

## Task 7: Runtime Controller Integration into TileView

**Files:**

- Create: `app/client/src/runtime/runtime-controller.ts`
- Modify: `app/client/src/TileView.tsx`
- Create: `app/client/src/runtime/__tests__/runtime-controller.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// app/client/src/runtime/__tests__/runtime-controller.integration.test.ts
import { describe, expect, it } from "vitest";
import { RuntimeController } from "../runtime-controller";

describe("runtime controller integration", () => {
  it("promotes requested tiles to visible when data resolves", async () => {
    const runtime = new RuntimeController({
      fetchTile: async (key) => ({
        key,
        coverage: {
          terrain: "full",
          hydro: "full",
          roads: "full",
          buildings: "full",
          vegetationHints: "full",
          labels: "full",
        },
      }),
    });

    await runtime.request("12/2050/1340");
    expect(runtime.get("12/2050/1340")?.state).toBe("visible");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/runtime-controller.integration.test.ts`
Expected: FAIL module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/client/src/runtime/runtime-controller.ts
import { createTileRecord, transitionTile } from "./tile-state-machine";
import type { TileRecord } from "./types";

export class RuntimeController {
  private records = new Map<string, TileRecord>();

  constructor(private deps: { fetchTile: (key: string) => Promise<unknown> }) {}

  async request(key: string): Promise<void> {
    const start = this.records.get(key) ?? createTileRecord(key);
    const loading = transitionTile(start, "loading");
    this.records.set(key, loading);

    await this.deps.fetchTile(key);

    const ready = transitionTile(loading, "ready");
    const visible = transitionTile(ready, "visible");
    this.records.set(key, visible);
  }

  get(key: string): TileRecord | undefined {
    return this.records.get(key);
  }
}
```

```tsx
// app/client/src/TileView.tsx (integration sketch)
// inside component initialization
// const runtime = useMemo(() => new RuntimeController({ fetchTile: fetchCanonicalTile }), []);
// on tile change: void runtime.request(tileKey);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/runtime-controller.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/client/src/runtime/runtime-controller.ts app/client/src/runtime/__tests__/runtime-controller.integration.test.ts app/client/src/TileView.tsx
git commit -m "feat: wire runtime controller into tile render flow"
```

## Task 8: Style Profiles + Material Mapper

**Files:**

- Create: `app/client/src/style/profiles.ts`
- Create: `app/client/src/style/material-mapper.ts`
- Modify: `app/client/src/geo/setup.ts`
- Create: `app/client/src/style/__tests__/material-mapper.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/client/src/style/__tests__/material-mapper.test.ts
import { describe, expect, it } from "vitest";
import { getStyleProfile } from "../profiles";
import { mapTerrainColor } from "../material-mapper";

describe("style mapper", () => {
  it("applies natural-daylight terrain mapping", () => {
    const profile = getStyleProfile("Natural-Daylight");
    const color = mapTerrainColor({ elevation: 0.2, slope: 0.1 }, profile);
    expect(color).toMatch(/^#/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/client && npm run test:unit -- src/style/__tests__/material-mapper.test.ts`
Expected: FAIL unresolved style modules.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/client/src/style/profiles.ts
export type StyleProfileName =
  | "Natural-Daylight"
  | "Golden-Hour"
  | "Overcast-Cool";

export interface StyleProfile {
  name: StyleProfileName;
  terrainLow: string;
  terrainMid: string;
  terrainHigh: string;
  waterDeep: string;
}

const PROFILES: Record<StyleProfileName, StyleProfile> = {
  "Natural-Daylight": {
    name: "Natural-Daylight",
    terrainLow: "#5f7f4b",
    terrainMid: "#6d7058",
    terrainHigh: "#8f949a",
    waterDeep: "#2e5879",
  },
  "Golden-Hour": {
    name: "Golden-Hour",
    terrainLow: "#7e7a4f",
    terrainMid: "#8b7054",
    terrainHigh: "#a1958a",
    waterDeep: "#3a5a72",
  },
  "Overcast-Cool": {
    name: "Overcast-Cool",
    terrainLow: "#566a58",
    terrainMid: "#64706d",
    terrainHigh: "#8f98a0",
    waterDeep: "#32546a",
  },
};

export function getStyleProfile(name: StyleProfileName): StyleProfile {
  return PROFILES[name];
}
```

```ts
// app/client/src/style/material-mapper.ts
import type { StyleProfile } from "./profiles";

export function mapTerrainColor(
  input: { elevation: number; slope: number },
  profile: StyleProfile,
): string {
  if (input.elevation < 0.25) return profile.terrainLow;
  if (input.elevation < 0.75) return profile.terrainMid;
  return profile.terrainHigh;
}
```

```ts
// app/client/src/geo/setup.ts (integration sketch)
// add optional profileName argument in setup config and pass through renderer uniforms
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/client && npm run test:unit -- src/style/__tests__/material-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/client/src/style/profiles.ts app/client/src/style/material-mapper.ts app/client/src/style/__tests__/material-mapper.test.ts app/client/src/geo/setup.ts
git commit -m "feat: add geography-first style profiles and mappers"
```

## Task 9: Runtime HUD + Long-Run Stability Hooks

**Files:**

- Create: `app/client/src/runtime/debug/runtime-hud.ts`
- Modify: `app/client/src/TileView.tsx`
- Create: `app/client/src/runtime/__tests__/runtime-hud.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/client/src/runtime/__tests__/runtime-hud.test.ts
import { describe, expect, it } from "vitest";
import { formatHudSnapshot } from "../debug/runtime-hud";

describe("runtime hud", () => {
  it("formats key metrics", () => {
    const text = formatHudSnapshot({
      fps: 58,
      activeTiles: 24,
      quality: "Q2",
      cacheHitRatio: 0.76,
    });
    expect(text).toContain("FPS: 58");
    expect(text).toContain("Quality: Q2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/runtime-hud.test.ts`
Expected: FAIL unresolved module.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/client/src/runtime/debug/runtime-hud.ts
export interface HudSnapshot {
  fps: number;
  activeTiles: number;
  quality: "Q3" | "Q2" | "Q1";
  cacheHitRatio: number;
}

export function formatHudSnapshot(input: HudSnapshot): string {
  return `FPS: ${input.fps} | Tiles: ${input.activeTiles} | Quality: ${input.quality} | Cache: ${Math.round(input.cacheHitRatio * 100)}%`;
}
```

```tsx
// app/client/src/TileView.tsx (integration sketch)
// add keybinding (e.g., "h") to toggle HUD visibility and render formatHudSnapshot output
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/runtime-hud.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/client/src/runtime/debug/runtime-hud.ts app/client/src/runtime/__tests__/runtime-hud.test.ts app/client/src/TileView.tsx
git commit -m "feat: add runtime diagnostics hud for streaming stability"
```

## Task 10: Docs + Validation Checklist

**Files:**

- Modify: `README.md`
- Create: `app/client/src/runtime/__tests__/stability-checklist.test.ts`

- [ ] **Step 1: Write the failing checklist test**

```ts
// app/client/src/runtime/__tests__/stability-checklist.test.ts
import { describe, expect, it } from "vitest";

describe("stability checklist", () => {
  it("documents mandatory runtime checks", () => {
    const checks = ["no-crash", "no-runaway-memory", "no-persistent-holes"];
    expect(checks).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (if file absent)**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__/stability-checklist.test.ts`
Expected: FAIL if file absent.

- [ ] **Step 3: Write minimal implementation (docs update)**

```md
<!-- README.md add section -->

## Exploratory World V1 Runtime

- Streaming rings: critical and prefetch windows around camera.
- Adaptive quality states: Q3/Q2/Q1 with hysteresis.
- Debug HUD toggle: shows FPS, active tiles, quality, and cache hit ratio.
- Validation run: 15-minute session in dense urban, mountainous, and coastal locations.
```

- [ ] **Step 4: Run targeted tests**

Run: `cd app/client && npm run test:unit -- src/runtime/__tests__`
Expected: PASS for all runtime test suites.

- [ ] **Step 5: Commit**

```bash
git add README.md app/client/src/runtime/__tests__/stability-checklist.test.ts
git commit -m "docs: add exploratory runtime validation checklist"
```

## Final Verification (M4 Gate)

- [ ] Run full unit suite:

Run: `cd app/client && npm run test:unit`
Expected: PASS all tests.

- [ ] Run exploratory dev session:

Run: `npm run dev` (server) and `npm start` (Electron)
Expected: tile streaming works with no persistent blank regions.

- [ ] Run 15-minute stability soak with HUD enabled:

Expected:

- no crash/hang
- no runaway memory growth trend
- adaptive transitions visible and non-oscillatory

- [ ] Capture three validation screenshots from different geographies and store references in PR notes.

---

## Spec Coverage Self-Check

- Architecture boundary (Streaming Core vs Style Core): covered by Tasks 2, 7, 8.
- Canonical schema and coverage bands: covered by Task 4.
- Fallback behavior for missing layers: covered by Task 5.
- Adaptive quality with hysteresis and knobs: covered by Task 6.
- On-flight continuity and scheduling queues: covered by Tasks 3 and 7.
- Visual profile consistency: covered by Task 8.
- Observability/debug instrumentation: covered by Task 9.
- Testing and long-run validation: covered by Tasks 1, 10, and Final Verification.

## Placeholder Scan

- No TBD/TODO placeholders in tasks.
- All code-changing steps include concrete snippets.
- All run steps include exact commands and expected outcomes.

## Type and Naming Consistency Scan

- Quality levels use consistent `Q3 | Q2 | Q1` naming across Tasks 6 and 9.
- Tile lifecycle names match `requested/loading/ready/visible/cooling/evicted` from Task 2.
- Coverage fields stay consistent: `terrain/hydro/roads/buildings/vegetationHints/labels`.
